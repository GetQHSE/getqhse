import { createHash, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { CurrentUser } from "@qhse/auth";
import {
  createAiKnowledgeExampleSchema,
  workQueueNames,
  type CreateAiKnowledgeExample,
  type ListAiKnowledgeExamples,
  type UpdateAiKnowledgeExample,
} from "@qhse/contracts";
import { Prisma } from "@qhse/database";
import type { Queue } from "bullmq";

import { AuthService } from "../auth/auth.service.js";

const editableRoles = new Set(["super_admin", "platform_admin", "content_manager"]);

const provenanceInclude = {
  sourceOrganization: { select: { id: true, name: true } },
  sourceProject: { select: { id: true, name: true } },
  sourceAnalysisReview: {
    select: { rating: true, comment: true, createdAt: true, run: { select: { status: true } } },
  },
  sourceRegulatoryEvaluation: {
    select: { result: true, comment: true, aiSuggestedResult: true, evaluatedAt: true },
  },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} as const;

@Injectable()
export class KnowledgeLibraryService {
  constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @InjectQueue(workQueueNames.knowledgeEmbedding)
    private readonly embeddingQueue: Queue,
  ) {}

  async list(_actor: CurrentUser, input: ListAiKnowledgeExamples) {
    const where: Prisma.AiKnowledgeExampleWhereInput = {
      feature: input.feature,
      ...(input.status ? { status: input.status } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.jurisdiction ? { jurisdiction: input.jurisdiction } : {}),
      ...(input.language ? { language: input.language } : {}),
      ...(input.tag ? { tags: { has: input.tag } } : {}),
      ...(input.embeddingStatus ? { embeddingStatus: input.embeddingStatus } : {}),
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
      ...(input.expectedResult ? { expectedResult: input.expectedResult } : {}),
      ...(input.evaluationSignal ? { evaluationSignal: input.evaluationSignal } : {}),
      ...(input.search
        ? {
            OR: [
              { title: { contains: input.search, mode: "insensitive" } },
              { scenarioSummary: { contains: input.search, mode: "insensitive" } },
              { guidance: { contains: input.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.auth.database.aiKnowledgeExample.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: provenanceInclude,
      }),
      this.auth.database.aiKnowledgeExample.count({ where }),
    ]);
    return {
      items,
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
      },
    };
  }

  async detail(_actor: CurrentUser, exampleId: string) {
    const example = await this.auth.database.aiKnowledgeExample.findUnique({
      where: { id: exampleId },
      include: provenanceInclude,
    });
    if (!example) throw new NotFoundException("Knowledge example not found");
    return example;
  }

  async create(actor: CurrentUser, rawInput: CreateAiKnowledgeExample) {
    this.requireEditor(actor);
    const input = createAiKnowledgeExampleSchema.parse(rawInput);
    return this.auth.database.aiKnowledgeExample.create({
      data: {
        feature: input.feature,
        status: "DRAFT",
        source: "ADMIN",
        title: input.title,
        scenarioSummary: input.scenarioSummary,
        guidance: input.guidance,
        jurisdiction: input.jurisdiction,
        language: input.language,
        tags: input.tags,
        payload: input.payload,
        rating: input.feature === "DISCOVERY" ? input.rating : null,
        expectedResult: input.feature === "CONFORMITY_EVALUATION" ? input.expectedResult : null,
        evaluationSignal: input.feature === "CONFORMITY_EVALUATION" ? input.evaluationSignal : null,
        embeddingStatus: "PENDING",
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
      },
      include: provenanceInclude,
    });
  }

  async update(actor: CurrentUser, exampleId: string, input: UpdateAiKnowledgeExample) {
    this.requireEditor(actor);
    const current = await this.auth.database.aiKnowledgeExample.findUnique({
      where: { id: exampleId },
    });
    if (!current) throw new NotFoundException("Knowledge example not found");
    const validated = createAiKnowledgeExampleSchema.parse({
      feature: current.feature,
      title: input.title ?? current.title,
      scenarioSummary: input.scenarioSummary ?? current.scenarioSummary,
      guidance: input.guidance === undefined ? current.guidance : input.guidance,
      jurisdiction: input.jurisdiction ?? current.jurisdiction,
      language: input.language ?? current.language,
      tags: input.tags ?? current.tags,
      ...(current.feature === "DISCOVERY"
        ? {
            rating: input.rating === undefined ? current.rating : input.rating,
            payload: input.payload ?? current.payload,
          }
        : {
            expectedResult: input.expectedResult ?? current.expectedResult,
            evaluationSignal: input.evaluationSignal ?? current.evaluationSignal,
            payload: input.payload ?? current.payload,
          }),
    });
    return this.auth.database.$transaction(async (database) => {
      await database.aiKnowledgeEmbedding.deleteMany({ where: { knowledgeExampleId: exampleId } });
      return database.aiKnowledgeExample.update({
        where: { id: exampleId },
        data: {
          status: "DRAFT",
          title: validated.title,
          scenarioSummary: validated.scenarioSummary,
          guidance: validated.guidance,
          jurisdiction: validated.jurisdiction,
          language: validated.language,
          tags: validated.tags,
          payload: validated.payload,
          rating: validated.feature === "DISCOVERY" ? validated.rating : null,
          expectedResult:
            validated.feature === "CONFORMITY_EVALUATION" ? validated.expectedResult : null,
          evaluationSignal:
            validated.feature === "CONFORMITY_EVALUATION" ? validated.evaluationSignal : null,
          embeddingStatus: "PENDING",
          embeddingError: null,
          updatedByUserId: actor.id,
        },
        include: provenanceInclude,
      });
    });
  }

  async approve(actor: CurrentUser, exampleId: string) {
    this.requireEditor(actor);
    const example = await this.auth.database.aiKnowledgeExample.findUnique({
      where: { id: exampleId },
      include: { sourceAnalysisReview: { select: { run: { select: { status: true } } } } },
    });
    if (!example) throw new NotFoundException("Knowledge example not found");
    if (example.sourceAnalysisReview && example.sourceAnalysisReview.run.status !== "COMPLETED") {
      throw new BadRequestException("Discovery feedback cannot be approved before publication");
    }
    const updated = await this.auth.database.aiKnowledgeExample.update({
      where: { id: exampleId },
      data: {
        status: "DRAFT",
        embeddingStatus: "PROCESSING",
        embeddingError: null,
        updatedByUserId: actor.id,
      },
    });
    await this.enqueueEmbedding(updated.id, updated.updatedAt);
    return updated;
  }

  async retryEmbedding(actor: CurrentUser, exampleId: string) {
    this.requireEditor(actor);
    const example = await this.auth.database.aiKnowledgeExample.findUnique({
      where: { id: exampleId },
    });
    if (!example) throw new NotFoundException("Knowledge example not found");
    if (example.embeddingStatus !== "FAILED") {
      throw new BadRequestException("Only a failed knowledge embedding can be retried");
    }
    const updated = await this.auth.database.aiKnowledgeExample.update({
      where: { id: exampleId },
      data: { embeddingStatus: "PROCESSING", embeddingError: null, updatedByUserId: actor.id },
    });
    await this.enqueueEmbedding(updated.id, updated.updatedAt);
    return updated;
  }

  async delete(actor: CurrentUser, exampleId: string): Promise<{ deleted: true }> {
    this.requireEditor(actor);
    const example = await this.auth.database.aiKnowledgeExample.findUnique({
      where: { id: exampleId },
      select: { id: true, feature: true },
    });
    if (!example) throw new NotFoundException("Knowledge example not found");
    await this.auth.database.$transaction(async (database) => {
      await database.aiKnowledgeActivity.create({
        data: {
          exampleId: example.id,
          feature: example.feature,
          action: "DELETED",
          actorUserId: actor.id,
        },
      });
      await database.aiKnowledgeExample.delete({ where: { id: example.id } });
    });
    return { deleted: true };
  }

  private requireEditor(actor: CurrentUser) {
    if (!editableRoles.has(actor.platformRole)) {
      throw new ForbiddenException("Knowledge management access is required");
    }
  }

  private async enqueueEmbedding(exampleId: string, updatedAt: Date) {
    const idempotencyKey = `${exampleId}:${updatedAt.toISOString()}`;
    const jobId = createHash("sha256").update(idempotencyKey).digest("hex");
    try {
      await this.embeddingQueue.add(
        "embed-knowledge-example",
        {
          organizationId: "platform",
          correlationId: randomUUID(),
          idempotencyKey,
          payload: { exampleId },
        },
        { jobId, attempts: 5, backoff: { type: "exponential", delay: 2_000 } },
      );
    } catch {
      // The persistent PENDING state is reconciled by the worker.
    }
  }
}
