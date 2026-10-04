import { randomUUID } from "node:crypto";
import {
  Inject,
  Injectable,
  Optional,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { createPrismaClient, Prisma, type DatabaseClient } from "@qhse/database";
import {
  roRegisterSchema,
  roEffectiveSchema,
  roActionContentSchema,
  type RoLaunch,
  type RoWrite,
} from "@qhse/contracts";
import { smqRo, smqPip } from "@qhse/domain";
import type { TenantContext } from "../../../common/request-context.js";
import { WorkQueueService } from "../../jobs/work-queue.service.js";
import { loadRoMaterial, roFingerprint } from "./ro-material.js";
import { mapRoItem, roItemInclude } from "./ro-mapper.js";
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
@Injectable()
export class RoService {
  private readonly db: DatabaseClient;
  constructor(
    @Inject(WorkQueueService) private readonly queue: WorkQueueService,
    @Optional() db?: DatabaseClient,
  ) {
    this.db = db ?? createPrismaClient();
  }
  private async project(t: TenantContext, id: string) {
    const p = await this.db.project.findFirst({
      where: { organizationId: t.organizationId, archivedAt: null, OR: [{ id }, { slug: id }] },
    });
    if (!p) throw new NotFoundException("Project not found");
    return p;
  }
  private async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${id} FOR UPDATE`;
    return tx.roState.upsert({ where: { projectId: id }, create: { projectId: id }, update: {} });
  }
  private async audit(
    tx: Prisma.TransactionClient,
    t: TenantContext,
    projectId: string,
    entityId: string,
    kind: string,
    previous: unknown,
    next: unknown,
    reason: string,
  ) {
    await tx.roCorrection.create({
      data: {
        projectId,
        entityId,
        entityType: kind,
        previousValue: json(previous ?? { absent: true }),
        newValue: json(next),
        reason,
        authorId: t.userId,
      },
    });
  }
  async register(t: TenantContext, id: string) {
    const p = await this.project(t, id);
    const m = await loadRoMaterial(this.db, p.id);
    const [state, rows, runs] = await Promise.all([
      this.db.roState.findUnique({ where: { projectId: p.id } }),
      this.db.roItem.findMany({
        where: { projectId: p.id },
        include: roItemInclude,
        orderBy: { createdAt: "asc" },
      }),
      this.db.roRun.findMany({
        where: { projectId: p.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    const fp = (state?.branchFingerprints ?? {}) as Record<string, string>;
    const outdated = Object.entries(fp).some(
      ([branch, value]) => m.branches[branch as keyof typeof m.branches] !== value,
    );
    const allowed = new Set(m.sources.map((s) => s.id));
    return roRegisterSchema.parse({
      projectId: p.id,
      projectName: p.name,
      organizationName: m.project.organization.name,
      standard: p.standardCode,
      language: m.language,
      revision: state?.revision ?? 0,
      outdated,
      validatedAt: state?.validatedAt?.toISOString() ?? null,
      sources: m.sources,
      items: rows.filter((r) => !r.sourceId || allowed.has(r.sourceId)).map(mapRoItem),
      runs: runs.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
      })),
    });
  }
  async launch(t: TenantContext, id: string, input: RoLaunch) {
    const p = await this.project(t, id);
    const material = await loadRoMaterial(this.db, p.id);
    const run = await this.db.$transaction(async (tx) => {
      const state = await this.lock(tx, p.id);
      if (
        await tx.roRun.findFirst({
          where: { projectId: p.id, status: { in: ["DRAFT", "RUNNING"] } },
        })
      )
        throw new ConflictException("RO_RUN_ACTIVE");
      const allowed = new Set(material.sources.map((s) => s.id));
      const items = (
        await tx.roItem.findMany({ where: { projectId: p.id }, include: roItemInclude })
      )
        .filter((i) => !i.sourceId || allowed.has(i.sourceId))
        .map(mapRoItem);
      const fp = state.branchFingerprints as Record<string, string>;
      const outdated = Object.entries(fp).some(
        ([b, v]) => material.branches[b as keyof typeof material.branches] !== v,
      );
      if (
        input.stage === "GENERATION" &&
        !material.sources.some((s) => s.branch === input.branch) &&
        !fp[input.branch]
      )
        throw new BadRequestException("RO_SOURCES_REQUIRED");
      if (
        input.stage === "TREATMENT" &&
        (!smqRo.computeRoWorkflow(items, outdated).completion[3] ||
          !items.some(smqRo.roTreatmentEligible))
      )
        throw new BadRequestException("RO_CONTROLS_REQUIRED");
      const sources =
        input.stage === "GENERATION"
          ? material.sources.filter((s) => s.branch === input.branch)
          : material.sources;
      return tx.roRun.create({
        data: {
          projectId: p.id,
          stage: input.stage,
          branch: input.stage === "GENERATION" ? input.branch : null,
          revision: state.revision,
          triggeredById: t.userId,
          contextFingerprint:
            input.stage === "GENERATION"
              ? material.branches[input.branch]
              : roFingerprint(material.branches),
          inputSnapshot: json({
            language: material.language,
            digest: material.digest,
            sources,
            items: input.stage === "TREATMENT" ? items.filter(smqRo.roTreatmentEligible) : [],
            referenceDate: new Date().toISOString().slice(0, 10),
          }),
        },
      });
    });
    try {
      await this.queue.enqueue("ro-analysis", "run-ro-analysis", {
        organizationId: t.organizationId,
        correlationId: randomUUID(),
        idempotencyKey: run.id,
        payload: { runId: run.id },
      });
    } catch (e) {
      await this.db.roRun.update({
        where: { id: run.id },
        data: { status: "FAILED", errorMessage: "RO_QUEUE_UNAVAILABLE", completedAt: new Date() },
      });
      throw e;
    }
    return { runId: run.id };
  }
  async write(t: TenantContext, id: string, input: RoWrite) {
    const p = await this.project(t, id);
    const m = await loadRoMaterial(this.db, p.id);
    await this.db.$transaction(async (tx) => {
      await this.lock(tx, p.id);
      const isAction = ["action", "progress", "effectiveness"].includes(input.kind);
      const action =
        isAction && "entityId" in input
          ? await tx.roAction.findFirst({
              where: { id: input.entityId, item: { projectId: p.id } },
              include: { item: true },
            })
          : null;
      const row =
        input.kind !== "add_item"
          ? await tx.roItem.findFirst({
              where: {
                id: action?.itemId ?? ("entityId" in input ? input.entityId : ""),
                projectId: p.id,
              },
              include: roItemInclude,
            })
          : null;
      if (input.kind !== "add_item" && (!row || (isAction && !action)))
        throw new NotFoundException("RO record not found");
      if (row?.sourceId && !m.sources.some((s) => s.id === row.sourceId))
        throw new ConflictException("RO_SOURCE_CHANGED");
      if (input.kind === "add_item") {
        const source = input.sourceId ? m.sources.find((s) => s.id === input.sourceId) : null;
        if (input.sourceId && !source) throw new BadRequestException("RO_SOURCES_REQUIRED");
        const key = `${input.sourceId ?? "manual"}:${input.content.type}:${smqPip.canonicalPipKey(input.content.title)}`;
        if (
          await tx.roItem.findUnique({
            where: { projectId_canonicalKey: { projectId: p.id, canonicalKey: key } },
          })
        )
          throw new ConflictException("RO_ITEM_EXISTS");
        const created = await tx.roItem.create({
          data: {
            projectId: p.id,
            canonicalKey: key,
            sourceId: source?.id ?? null,
            ...(source ? { sourceSnapshot: json(source) } : {}),
            origin: "user",
            reviewStatus: "VALIDATED",
            effective: json({
              content: { ...input.content, confidence: null },
              rating: null,
              ratingReviewed: false,
              controlsState: "undeclared",
              controls: [],
              controlsReviewed: false,
            }),
          },
        });
        await this.audit(tx, t, p.id, created.id, input.kind, null, input, input.reason);
      } else if (row) {
        const before = roEffectiveSchema.parse(row.effective);
        const next = structuredClone(before);
        if (input.kind === "item") {
          next.content = {
            ...(input.content ?? before.content),
            confidence: before.content.confidence,
          };
          if (next.content.type !== before.content.type) {
            next.rating = null;
            next.ratingReviewed = false;
          }
          if (input.content && JSON.stringify(next.content) !== JSON.stringify(before.content)) {
            next.ratingReviewed = false;
            next.controlsReviewed = false;
            await tx.roAction.updateMany({
              where: { itemId: row.id },
              data: { reviewStatus: "PENDING" },
            });
          }
          await tx.roItem.update({
            where: { id: row.id },
            data: { effective: json(next), reviewStatus: input.reviewStatus },
          });
        } else if (input.kind === "rating") {
          if (!smqRo.isRetainedRo(row) || !smqRo.validRoRating(before.content.type, input.rating))
            throw new BadRequestException("RO_RATING_INVALID");
          next.rating = input.rating;
          next.ratingReviewed = true;
          next.controlsReviewed = false;
          await tx.roItem.update({ where: { id: row.id }, data: { effective: json(next) } });
          await tx.roAction.updateMany({
            where: { itemId: row.id },
            data: { reviewStatus: "PENDING" },
          });
        } else if (input.kind === "controls") {
          if (
            !smqRo.isRetainedRo(row) ||
            !before.ratingReviewed ||
            !smqRo.validRoRating(before.content.type, before.rating)
          )
            throw new BadRequestException("RO_RATING_REQUIRED");
          next.controlsState = input.state;
          next.controls = input.controls;
          next.controlsReviewed = true;
          await tx.roItem.update({ where: { id: row.id }, data: { effective: json(next) } });
          await tx.roAction.updateMany({
            where: { itemId: row.id },
            data: { reviewStatus: input.state === "existing" ? "NOT_RETAINED" : "PENDING" },
          });
        } else if (input.kind === "add_action") {
          if (!smqRo.roTreatmentEligible(mapRoItem(row)))
            throw new BadRequestException("RO_CONTROLS_REQUIRED");
          const key = smqPip.canonicalPipKey(input.content.title);
          if (
            await tx.roAction.findUnique({
              where: { itemId_canonicalKey: { itemId: row.id, canonicalKey: key } },
            })
          )
            throw new ConflictException("RO_ACTION_EXISTS");
          await tx.roAction.create({
            data: {
              itemId: row.id,
              canonicalKey: key,
              origin: "user",
              effective: json(input.content),
              reviewStatus: "VALIDATED",
            },
          });
        } else if (action && input.kind === "action") {
          if (smqRo.isRetainedRo(input) && !smqRo.roTreatmentEligible(mapRoItem(row)))
            throw new BadRequestException("RO_CONTROLS_REQUIRED");
          await tx.roAction.update({
            where: { id: action.id },
            data: {
              effective: json(roActionContentSchema.parse(input.content ?? action.effective)),
              reviewStatus: input.reviewStatus,
            },
          });
        } else if (action && (input.kind === "progress" || input.kind === "effectiveness")) {
          if (!smqRo.isRetainedRo(action) || !smqRo.isRetainedRo(row))
            throw new BadRequestException("RO_ACTION_REQUIRED");
          if (
            input.kind === "progress" &&
            input.content.actualDate &&
            input.content.actualDate > new Date().toISOString().slice(0, 10)
          )
            throw new BadRequestException("RO_REVIEW_DATE_INVALID");
          if (input.kind === "effectiveness") {
            const progress = await tx.roActionEvent.findFirst({
              where: { actionId: action.id, kind: "progress" },
              orderBy: { createdAt: "desc" },
            });
            if (!progress || (progress.content as { status: string }).status !== "completed")
              throw new BadRequestException("RO_COMPLETION_REQUIRED");
            if ((progress.content as { actualDate: string }).actualDate > input.content.date)
              throw new BadRequestException("RO_REVIEW_DATE_INVALID");
            if (input.content.date > new Date().toISOString().slice(0, 10))
              throw new BadRequestException("RO_REVIEW_DATE_INVALID");
          }
          await tx.roActionEvent.create({
            data: {
              actionId: action.id,
              kind: input.kind,
              content: json(input.content),
              authorId: t.userId,
            },
          });
        }
        await this.audit(
          tx,
          t,
          p.id,
          "entityId" in input ? input.entityId : row.id,
          input.kind,
          action?.effective ?? row.effective,
          input,
          input.reason,
        );
      }
      await tx.roState.update({
        where: { projectId: p.id },
        data: { revision: { increment: 1 }, validatedAt: null, validatedById: null },
      });
    });
    return this.register(t, p.id);
  }
  async validate(t: TenantContext, id: string) {
    const p = await this.project(t, id);
    const m = await loadRoMaterial(this.db, p.id);
    await this.db.$transaction(async (tx) => {
      const state = await this.lock(tx, p.id);
      const fp = state.branchFingerprints as Record<string, string>;
      const outdated = Object.entries(fp).some(
        ([b, v]) => m.branches[b as keyof typeof m.branches] !== v,
      );
      const allowed = new Set(m.sources.map((s) => s.id));
      const items = (
        await tx.roItem.findMany({ where: { projectId: p.id }, include: roItemInclude })
      )
        .filter((r) => !r.sourceId || allowed.has(r.sourceId))
        .map(mapRoItem);
      if (!smqRo.computeRoWorkflow(items, outdated).complete)
        throw new BadRequestException("RO_REGISTER_INCOMPLETE");
      if (
        await tx.roRun.findFirst({
          where: { projectId: p.id, status: { in: ["DRAFT", "RUNNING"] } },
        })
      )
        throw new ConflictException("RO_RUN_ACTIVE");
      await tx.roState.update({
        where: { projectId: p.id },
        data: { validatedAt: new Date(), validatedById: t.userId },
      });
      await this.audit(
        tx,
        t,
        p.id,
        p.id,
        "register",
        state,
        {
          items: items.filter(smqRo.isRetainedRo),
          methodologyVersion: "ro-v2",
          validated: true,
          revision: state.revision,
        },
        "Final register validated",
      );
    });
    return this.register(t, p.id);
  }
}
