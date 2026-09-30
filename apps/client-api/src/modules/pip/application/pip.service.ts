import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { validatedProfileAnswers } from "@qhse/ai";
import { createPrismaClient, Prisma, type DatabaseClient } from "@qhse/database";
import {
  pipPartyContentSchema,
  pipRequirementContentSchema,
  pipEvaluationContentSchema,
  pipRegisterSchema,
  type PipRegister,
  type PipLaunch,
  type PipReview,
  type PipAllocation,
  type PipAddParty,
  type PipAddRequirement,
  type PipAnswer,
} from "@qhse/contracts";
import { smqPip } from "@qhse/domain";
import type { TenantContext } from "../../../common/request-context.js";
import { WorkQueueService } from "../../jobs/work-queue.service.js";
import { loadPipMaterial } from "./pip-material.js";
import { mapPipParty, pipPartyInclude } from "./pip-mapper.js";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class PipService {
  private readonly database: DatabaseClient;
  constructor(
    @Inject(WorkQueueService) private readonly queue: WorkQueueService,
    @Optional() database?: DatabaseClient,
  ) {
    this.database = database ?? createPrismaClient();
  }
  private async project(tenant: TenantContext, id: string) {
    const project = await this.database.project.findFirst({
      where: {
        organizationId: tenant.organizationId,
        archivedAt: null,
        OR: [{ id }, { slug: id }],
      },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
  private async lock(tx: Prisma.TransactionClient, projectId: string) {
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
    return tx.pipState.upsert({ where: { projectId }, create: { projectId }, update: {} });
  }
  private async changed(tx: Prisma.TransactionClient, projectId: string, partyId?: string) {
    await tx.pipState.update({
      where: { projectId },
      data: { revision: { increment: 1 }, validatedAt: null, validatedById: null },
    });
    if (partyId)
      await tx.pipEvaluation.updateMany({ where: { partyId }, data: { reviewStatus: "PENDING" } });
  }
  private async audit(
    tx: Prisma.TransactionClient,
    tenant: TenantContext,
    projectId: string,
    entityType: string,
    entityId: string,
    previous: unknown,
    next: unknown,
    reason: string,
  ) {
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    await tx.pipCorrection.create({
      data: {
        projectId,
        entityType,
        entityId,
        previousValue: json(previous ?? { absent: true }),
        newValue: json(next),
        reason,
        authorId: tenant.userId,
      },
    });
  }
  async register(tenant: TenantContext, id: string): Promise<PipRegister> {
    const { id: projectId } = await this.project(tenant, id);
    const { project, material, fingerprint } = await loadPipMaterial(this.database, projectId);
    const [state, parties, runs, clarifications] = await Promise.all([
      this.database.pipState.findUnique({ where: { projectId } }),
      this.database.pipParty.findMany({
        where: { projectId },
        include: pipPartyInclude,
        orderBy: { createdAt: "asc" },
      }),
      this.database.pipRun.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      this.database.pipClarification.findMany({ where: { projectId }, orderBy: { id: "asc" } }),
    ]);
    return pipRegisterSchema.parse({
      projectId,
      projectName: project.name,
      organizationName: project.organization.name,
      standard: project.standardCode,
      language: material.language,
      evaluationMethod: state?.evaluationMethod ?? "both",
      revision: state?.revision ?? 0,
      outdated: !!state?.inventoryFingerprint && state.inventoryFingerprint !== fingerprint,
      validatedAt: state?.validatedAt?.toISOString() ?? null,
      parties: parties.map(mapPipParty),
      clarifications,
      runs: runs.map((run) => ({
        ...run,
        createdAt: run.createdAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
      })),
    });
  }
  async launch(tenant: TenantContext, id: string, input: PipLaunch) {
    const { id: projectId } = await this.project(tenant, id);
    const { project, material, fingerprint } = await loadPipMaterial(this.database, projectId);
    const snapshot = (project.profile?.snapshots[0]?.data ?? {}) as {
      fields?: Record<string, unknown>;
    };
    if (validatedProfileAnswers(snapshot.fields ?? {}).length === 0)
      throw new BadRequestException("PIP_PROFILE_REQUIRED");
    const run = await this.database.$transaction(async (tx) => {
      let state = await this.lock(tx, projectId);
      const active = await tx.pipRun.findFirst({
        where: { projectId, status: { in: ["DRAFT", "RUNNING"] } },
      });
      if (active) throw new ConflictException("PIP_RUN_ACTIVE");
      const parties = (
        await tx.pipParty.findMany({ where: { projectId }, include: pipPartyInclude })
      ).map(mapPipParty);
      const outdated = !!state.inventoryFingerprint && state.inventoryFingerprint !== fingerprint;
      const workflow = smqPip.computePipWorkflow(parties, state.evaluationMethod, outdated);
      if (input.stage === "REQUIREMENTS" && !workflow.completion[0])
        throw new BadRequestException("PIP_INVENTORY_REQUIRED");
      if (input.stage === "EVALUATION" && !workflow.completion[2])
        throw new BadRequestException("PIP_ALLOCATION_REQUIRED");
      if (input.stage === "EVALUATION" && state.evaluationMethod !== input.method) {
        await tx.pipEvaluation.updateMany({
          where: { party: { projectId } },
          data: { reviewStatus: "PENDING" },
        });
        state = await tx.pipState.update({
          where: { projectId },
          data: {
            evaluationMethod: input.method,
            revision: { increment: 1 },
            validatedAt: null,
            validatedById: null,
          },
        });
      }
      return tx.pipRun.create({
        data: {
          projectId,
          stage: input.stage,
          revision: state.revision,
          contextFingerprint: fingerprint,
          triggeredById: tenant.userId,
          inputSnapshot: json({
            ...material,
            method: input.stage === "EVALUATION" ? input.method : state.evaluationMethod,
            parties: parties.filter(smqPip.isRetained).map((party) => ({
              ...party,
              requirements: party.requirements.filter(smqPip.isRetained),
            })),
          }),
        },
      });
    });
    try {
      await this.queue.enqueue("pip-analysis", "run-pip-analysis", {
        organizationId: tenant.organizationId,
        correlationId: randomUUID(),
        idempotencyKey: run.id,
        payload: { runId: run.id },
      });
    } catch (error) {
      await this.database.pipRun.update({
        where: { id: run.id },
        data: { status: "FAILED", errorMessage: "PIP_QUEUE_UNAVAILABLE", completedAt: new Date() },
      });
      throw error;
    }
    return { runId: run.id };
  }
  async review(tenant: TenantContext, id: string, input: PipReview) {
    const { id: projectId } = await this.project(tenant, id);
    await this.database.$transaction(async (tx) => {
      const state = await this.lock(tx, projectId);
      if (input.entityType === "party") {
        const row = await tx.pipParty.findFirst({ where: { id: input.entityId, projectId } });
        if (!row) throw new NotFoundException("Party not found");
        const priorContent = pipPartyContentSchema.parse(row.effective);
        const content = {
          ...pipPartyContentSchema.parse(input.content ?? row.effective),
          confidence: priorContent.confidence,
          evidence: priorContent.evidence,
        };
        const before = { content: row.effective, reviewStatus: row.reviewStatus };
        const after = { content, reviewStatus: input.reviewStatus };
        await this.audit(tx, tenant, projectId, "party", row.id, before, after, input.reason);
        await tx.pipParty.update({
          where: { id: row.id },
          data: { effective: json(content), reviewStatus: input.reviewStatus },
        });
        await this.changed(tx, projectId, row.id);
      } else if (input.entityType === "requirement") {
        const row = await tx.pipRequirement.findFirst({
          where: { id: input.entityId, party: { projectId } },
        });
        if (!row) throw new NotFoundException("Requirement not found");
        const content = pipRequirementContentSchema.parse(input.content ?? row.effective);
        const prior = pipRequirementContentSchema.parse(row.effective);
        if (content.kind !== prior.kind) throw new BadRequestException("PIP_KIND_IMMUTABLE");
        await this.checkRequirementSource(tx, projectId, content);
        await this.audit(
          tx,
          tenant,
          projectId,
          "requirement",
          row.id,
          { content: prior, reviewStatus: row.reviewStatus },
          { content, reviewStatus: input.reviewStatus },
          input.reason,
        );
        const textChanged = JSON.stringify(prior) !== JSON.stringify(content);
        await tx.pipRequirement.update({
          where: { id: row.id },
          data: {
            effective: json(content),
            reviewStatus: input.reviewStatus,
            ...(textChanged ? { allocationReviewed: false, noServiceConfirmed: false } : {}),
          },
        });
        await this.changed(tx, projectId, row.partyId);
      } else {
        const row = await tx.pipEvaluation.findFirst({
          where: { id: input.entityId, party: { projectId } },
        });
        if (!row) throw new NotFoundException("Evaluation not found");
        const content = pipEvaluationContentSchema.parse(input.content ?? row.effective);
        if (smqPip.isRetained(input)) {
          const parties = (
            await tx.pipParty.findMany({ where: { projectId }, include: pipPartyInclude })
          ).map(mapPipParty);
          const workflow = smqPip.computePipWorkflow(parties, state.evaluationMethod);
          if (!workflow.completion[2]) throw new BadRequestException("PIP_ALLOCATION_REQUIRED");
          if (
            !smqPip.evaluationComplete(
              {
                reviewStatus: "VALIDATED",
                requirements: [],
                evaluation: {
                  reviewStatus: "VALIDATED",
                  content,
                },
              },
              state.evaluationMethod,
            )
          )
            throw new BadRequestException("PIP_EVALUATION_INCOMPLETE");
        }
        await this.audit(
          tx,
          tenant,
          projectId,
          "evaluation",
          row.id,
          { content: row.effective, reviewStatus: row.reviewStatus },
          { content, reviewStatus: input.reviewStatus },
          input.reason,
        );
        await tx.pipEvaluation.update({
          where: { id: row.id },
          data: { effective: json(content), reviewStatus: input.reviewStatus, humanOverride: true },
        });
        await this.changed(tx, projectId);
      }
    });
    return this.register(tenant, projectId);
  }
  private async checkRequirementSource(
    tx: Prisma.TransactionClient,
    projectId: string,
    content: { sourceType: string; regulatoryEntryId: string | null; text: string },
  ) {
    if (content.sourceType === "normative")
      throw new BadRequestException("PIP_NORMATIVE_SOURCE_UNAVAILABLE");
    if (content.regulatoryEntryId) {
      const entry = await tx.regulatoryRegisterEntry.findFirst({
        where: { id: content.regulatoryEntryId, baseline: { watch: { projectId } } },
      });
      const watch = await tx.projectRegulatoryWatch.findUnique({ where: { projectId } });
      if (!entry || entry.baselineId !== watch?.currentBaselineId)
        throw new BadRequestException("PIP_REGULATORY_SOURCE_INVALID");
      if (
        content.sourceType === "legal_regulatory" &&
        (!entry.requirementText || entry.requirementText.trim() !== content.text.trim())
      )
        throw new BadRequestException("PIP_REGULATORY_REQUIREMENT_UNVERIFIED");
    } else if (content.sourceType === "legal_regulatory")
      throw new BadRequestException("PIP_REGULATORY_SOURCE_REQUIRED");
  }
  async addParty(tenant: TenantContext, id: string, input: PipAddParty) {
    const { id: projectId } = await this.project(tenant, id);
    await this.database.$transaction(async (tx) => {
      await this.lock(tx, projectId);
      const key = smqPip.canonicalPipKey(input.name);
      if (!key) throw new BadRequestException("PIP_PARTY_NAME_INVALID");
      if (
        await tx.pipParty.findUnique({
          where: { projectId_canonicalKey: { projectId, canonicalKey: key } },
        })
      )
        throw new ConflictException("PIP_PARTY_EXISTS");
      const row = await tx.pipParty.create({
        data: {
          projectId,
          canonicalKey: key,
          origin: "user",
          reviewStatus: "VALIDATED",
          effective: json({
            ...input,
            confidence: null,
            evidence: [{ sourceType: "user_input", reference: null, excerpt: input.reasoning }],
          }),
        },
      });
      await this.audit(tx, tenant, projectId, "party", row.id, null, input, input.reasoning);
      await this.changed(tx, projectId);
    });
    return this.register(tenant, projectId);
  }
  async addRequirement(tenant: TenantContext, id: string, input: PipAddRequirement) {
    const { id: projectId } = await this.project(tenant, id);
    await this.database.$transaction(async (tx) => {
      await this.lock(tx, projectId);
      const party = await tx.pipParty.findFirst({
        where: { id: input.partyId, projectId, reviewStatus: { in: ["VALIDATED", "MODIFIED"] } },
      });
      if (!party) throw new NotFoundException("Retained party not found");
      await this.checkRequirementSource(tx, projectId, input.content);
      const canonicalKey = `${input.content.kind}:${smqPip.canonicalPipKey(input.content.text)}`;
      if (
        await tx.pipRequirement.findUnique({
          where: { partyId_canonicalKey: { partyId: party.id, canonicalKey } },
        })
      )
        throw new ConflictException("PIP_REQUIREMENT_EXISTS");
      const row = await tx.pipRequirement.create({
        data: {
          partyId: party.id,
          canonicalKey,
          origin: "user",
          effective: json(input.content),
          reviewStatus: "VALIDATED",
        },
      });
      await this.audit(
        tx,
        tenant,
        projectId,
        "requirement",
        row.id,
        null,
        input.content,
        input.content.reasoning,
      );
      await this.changed(tx, projectId, party.id);
    });
    return this.register(tenant, projectId);
  }
  async allocate(tenant: TenantContext, id: string, input: PipAllocation) {
    const { id: projectId } = await this.project(tenant, id);
    await this.database.$transaction(async (tx) => {
      await this.lock(tx, projectId);
      const row = await tx.pipRequirement.findFirst({
        where: {
          id: input.requirementId,
          party: { projectId, reviewStatus: { in: ["VALIDATED", "MODIFIED"] } },
          reviewStatus: { in: ["VALIDATED", "MODIFIED"] },
        },
      });
      if (!row) throw new NotFoundException("Retained requirement not found");
      if (pipRequirementContentSchema.parse(row.effective).kind === "need")
        throw new BadRequestException("PIP_NEEDS_NO_ALLOCATION");
      const next = {
        services: [...new Set(input.services)],
        allocationReviewed: true,
        noServiceConfirmed: input.noServiceConfirmed,
      };
      await this.audit(
        tx,
        tenant,
        projectId,
        "allocation",
        row.id,
        {
          services: row.services,
          allocationReviewed: row.allocationReviewed,
          noServiceConfirmed: row.noServiceConfirmed,
        },
        next,
        input.reason,
      );
      await tx.pipRequirement.update({ where: { id: row.id }, data: next });
      await this.changed(tx, projectId, row.partyId);
    });
    return this.register(tenant, projectId);
  }
  async answer(tenant: TenantContext, id: string, input: PipAnswer) {
    const { id: projectId } = await this.project(tenant, id);
    await this.database.$transaction(async (tx) => {
      await this.lock(tx, projectId);
      const row = await tx.pipClarification.findFirst({ where: { id: input.id, projectId } });
      if (!row) throw new NotFoundException("Clarification not found");
      await this.audit(
        tx,
        tenant,
        projectId,
        "clarification",
        row.id,
        { answer: row.answer },
        input,
        "Clarification answer updated",
      );
      await tx.pipClarification.update({
        where: { id: row.id },
        data: { answer: input.answer, answeredById: tenant.userId, answeredAt: new Date() },
      });
      await this.changed(tx, projectId);
    });
    return this.register(tenant, projectId);
  }
  async validate(tenant: TenantContext, id: string) {
    const { id: projectId } = await this.project(tenant, id);
    const { fingerprint } = await loadPipMaterial(this.database, projectId);
    await this.database.$transaction(async (tx) => {
      const state = await this.lock(tx, projectId);
      const parties = (
        await tx.pipParty.findMany({ where: { projectId }, include: pipPartyInclude })
      ).map(mapPipParty);
      if (
        !smqPip.computePipWorkflow(
          parties,
          state.evaluationMethod,
          !state.inventoryFingerprint || state.inventoryFingerprint !== fingerprint,
        ).complete
      )
        throw new BadRequestException("PIP_REGISTER_INCOMPLETE");
      if (await tx.pipRun.findFirst({ where: { projectId, status: { in: ["DRAFT", "RUNNING"] } } }))
        throw new ConflictException("PIP_RUN_ACTIVE");
      await tx.pipState.update({
        where: { projectId },
        data: { validatedAt: new Date(), validatedById: tenant.userId },
      });
      await this.audit(
        tx,
        tenant,
        projectId,
        "register",
        projectId,
        { validatedAt: state.validatedAt },
        {
          revision: state.revision,
          validated: true,
          evaluationMethod: state.evaluationMethod,
          parties: parties.filter(smqPip.isRetained),
        },
        "Final PIP register validated",
      );
    });
    return this.register(tenant, projectId);
  }
}
