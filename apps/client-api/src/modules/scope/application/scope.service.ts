import { randomUUID } from "node:crypto";
import {
  Injectable,
  Inject,
  Optional,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { createPrismaClient, Prisma, type DatabaseClient } from "@qhse/database";
import {
  scopeDeclarationSchema,
  scopeRegisterSchema,
  scopeVerificationInputSchema,
  scopeStatementContentSchema,
  type ScopeWrite,
  type ScopeLaunch,
} from "@qhse/contracts";
import { smqScope } from "@qhse/domain";
import type { TenantContext } from "../../../common/request-context.js";
import { WorkQueueService } from "../../jobs/work-queue.service.js";
import { loadScopeFacts, scopeFingerprint } from "./scope-material.js";
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
@Injectable()
export class ScopeService {
  private readonly db: DatabaseClient;
  constructor(
    @Inject(WorkQueueService) private readonly queue: WorkQueueService,
    @Optional() db?: DatabaseClient,
  ) {
    this.db = db ?? createPrismaClient();
  }
  private async project(t: TenantContext, id: string) {
    const project = await this.db.project.findFirst({
      where: { organizationId: t.organizationId, archivedAt: null, OR: [{ id }, { slug: id }] },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
  private async lock(tx: Prisma.TransactionClient, projectId: string, revision: number) {
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
    const state = await tx.scopeState.upsert({
      where: { projectId },
      create: { projectId, declaration: json(smqScope.emptyDeclaration()) },
      update: {},
    });
    if (state.revision !== revision) throw new ConflictException("SCOPE_INPUT_CHANGED");
    return state;
  }
  async register(t: TenantContext, id: string) {
    const p = await this.project(t, id);
    return this.db.$transaction(
      async (tx) => {
        const facts = await loadScopeFacts(tx, p.id);
        const [state, verification, statements, runs] = await Promise.all([
          tx.scopeState.findUnique({ where: { projectId: p.id } }),
          tx.scopeVerification.findFirst({
            where: { projectId: p.id },
            orderBy: { reviewedAt: "desc" },
          }),
          tx.scopeStatement.findMany({
            where: { projectId: p.id },
            orderBy: [{ validatedAt: "desc" }, { updatedAt: "desc" }],
          }),
          tx.scopeRun.findMany({
            where: { projectId: p.id },
            orderBy: { createdAt: "desc" },
            take: 20,
          }),
        ]);
        const declaration = scopeDeclarationSchema.parse(
          state?.declaration ?? smqScope.emptyDeclaration(),
        );
        const fingerprint = scopeFingerprint({ facts, declaration });
        return scopeRegisterSchema.parse({
          projectId: p.id,
          facts,
          declaration,
          fingerprint,
          revision: state?.revision ?? 0,
          verification: verification
            ? {
                ...scopeVerificationInputSchema.parse(verification.decision),
                id: verification.id,
                fingerprint: verification.fingerprint,
                authorId: verification.authorId,
                reviewedAt: verification.reviewedAt.toISOString(),
              }
            : null,
          verificationCurrent: verification?.fingerprint === fingerprint,
          statements: statements.map((s) => ({
            ...s,
            generatedAt: s.generatedAt?.toISOString() ?? null,
            validatedAt: s.validatedAt?.toISOString() ?? null,
            updatedAt: s.updatedAt.toISOString(),
          })),
          runs: runs.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async write(t: TenantContext, id: string, input: ScopeWrite) {
    const p = await this.project(t, id);
    await this.db.$transaction(async (tx) => {
      const state = await this.lock(tx, p.id, input.revision);
      const facts = await loadScopeFacts(tx, p.id);
      const declaration = scopeDeclarationSchema.parse(state.declaration);
      const fingerprint = scopeFingerprint({ facts, declaration });
      let previous: unknown = null;
      let next: unknown = input;
      let entityId = p.id;
      if (input.kind === "declaration") {
        previous = declaration;
        next = input.declaration;
        await tx.scopeState.update({
          where: { projectId: p.id },
          data: { declaration: json(input.declaration) },
        });
      } else if (input.kind === "verification") {
        if (input.fingerprint !== fingerprint) throw new ConflictException("SCOPE_INPUT_CHANGED");
        if (
          facts.standard !== "ISO_9001" ||
          !smqScope.canVerify(declaration, facts, input.verification.acknowledgedFindings)
        )
          throw new BadRequestException("SCOPE_DECLARATIONS_INCOMPLETE");
        const v = await tx.scopeVerification.create({
          data: {
            projectId: p.id,
            fingerprint,
            decision: json(input.verification),
            authorId: t.userId,
          },
        });
        entityId = v.id;
      } else {
        const row = await tx.scopeStatement.findFirst({
          where: { id: input.statementId, projectId: p.id, status: "DRAFT" },
        });
        const verification = await tx.scopeVerification.findFirst({
          where: { projectId: p.id },
          orderBy: { reviewedAt: "desc" },
        });
        if (!row) throw new NotFoundException("Scope draft not found");
        if (
          !verification ||
          row.fingerprint !== fingerprint ||
          verification.fingerprint !== fingerprint ||
          row.verificationId !== verification.id
        )
          throw new ConflictException("SCOPE_VERIFICATION_REQUIRED");
        const decision = scopeVerificationInputSchema.parse(verification.decision);
        const content = scopeStatementContentSchema.parse({
          statement: input.kind === "statement" ? input.statement : row.statement,
          nonApplicable: row.nonApplicable,
        });
        if (!smqScope.validStatement(content, { facts, declaration, verification: decision }))
          throw new BadRequestException("SCOPE_STATEMENT_INVALID");
        previous = row;
        next = content;
        entityId = row.id;
        if (input.kind === "statement")
          await tx.scopeStatement.update({
            where: { id: row.id },
            data: { statement: content.statement, professionallyModified: true },
          });
        else {
          const aggregate = await tx.scopeStatement.aggregate({
            where: { projectId: p.id },
            _max: { version: true },
          });
          const version = (aggregate._max.version ?? 0) + 1;
          await tx.scopeStatement.update({
            where: { id: row.id },
            data: {
              status: "VALIDATED",
              version,
              validatedAt: new Date(),
              validatedById: t.userId,
            },
          });
          next = { ...content, version };
        }
      }
      await tx.scopeCorrection.create({
        data: {
          projectId: p.id,
          entityId,
          kind: input.kind,
          previousValue: json(previous ?? { absent: true }),
          newValue: json(next),
          authorId: t.userId,
        },
      });
      await tx.scopeState.update({
        where: { projectId: p.id },
        data: { revision: { increment: 1 } },
      });
    });
    return this.register(t, p.id);
  }
  async launch(t: TenantContext, id: string, input: ScopeLaunch) {
    const p = await this.project(t, id);
    const run = await this.db.$transaction(async (tx) => {
      const state = await this.lock(tx, p.id, input.revision);
      const facts = await loadScopeFacts(tx, p.id);
      const declaration = scopeDeclarationSchema.parse(state.declaration);
      const fingerprint = scopeFingerprint({ facts, declaration });
      const v = await tx.scopeVerification.findFirst({
        where: { projectId: p.id },
        orderBy: { reviewedAt: "desc" },
      });
      if (input.fingerprint !== fingerprint || !v || v.fingerprint !== fingerprint)
        throw new ConflictException("SCOPE_VERIFICATION_REQUIRED");
      if (
        await tx.scopeRun.findFirst({
          where: { projectId: p.id, status: { in: ["DRAFT", "RUNNING"] } },
        })
      )
        throw new ConflictException("SCOPE_RUN_ACTIVE");
      const decision = scopeVerificationInputSchema.parse(v.decision);
      return tx.scopeRun.create({
        data: {
          projectId: p.id,
          revision: state.revision,
          inputSnapshot: json({
            facts,
            declaration,
            fingerprint,
            verification: {
              ...decision,
              id: v.id,
              fingerprint: v.fingerprint,
              authorId: v.authorId,
              reviewedAt: v.reviewedAt.toISOString(),
            },
          }),
        },
      });
    });
    try {
      await this.queue.enqueue("scope-statement", "scope-statement", {
        organizationId: t.organizationId,
        correlationId: randomUUID(),
        idempotencyKey: run.id,
        payload: { runId: run.id },
      });
    } catch {
      await this.db.scopeRun.update({
        where: { id: run.id },
        data: { status: "FAILED", error: "SCOPE_QUEUE_UNAVAILABLE", completedAt: new Date() },
      });
      throw new BadRequestException("SCOPE_QUEUE_UNAVAILABLE");
    }
    return { runId: run.id, status: "DRAFT" as const };
  }
  async exportVersion(t: TenantContext, id: string, statementId: string) {
    const p = await this.project(t, id);
    const row = await this.db.scopeStatement.findFirst({
      where: { id: statementId, projectId: p.id, status: "VALIDATED" },
    });
    if (!row) throw new NotFoundException("Validated scope version not found");
    // Historical exports intentionally use their frozen source snapshot.
    return scopeRegisterSchema.shape.statements.element.parse({
      ...row,
      generatedAt: row.generatedAt?.toISOString() ?? null,
      validatedAt: row.validatedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    });
  }
}
