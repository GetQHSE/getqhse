import { createHash, randomUUID } from "node:crypto";

import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { embeddingModel, embeddingProviderOptions } from "@qhse/ai";
import { jobEnvelopeSchema, workQueueNames, type JobEnvelope } from "@qhse/contracts";
import { embeddingProviderSchema } from "@qhse/config";
import { createPrismaClient, Prisma, type DatabaseClient } from "@qhse/database";
import { embed } from "ai";
import type { Job, Queue } from "bullmq";

import { knowledgeEmbeddingInput } from "../knowledge-library.js";

@Processor(workQueueNames.knowledgeEmbedding, { concurrency: 2 })
export class KnowledgeEmbeddingProcessor extends WorkerHost {
  private readonly database: DatabaseClient = createPrismaClient();

  async process(job: Job<JobEnvelope>) {
    const envelope = jobEnvelopeSchema.parse(job.data);
    const exampleId =
      typeof envelope.payload["exampleId"] === "string" ? envelope.payload["exampleId"] : null;
    if (!exampleId) throw new Error("exampleId is required");
    const example = await this.database.aiKnowledgeExample.findFirst({
      where: { id: exampleId, status: "DRAFT", embeddingStatus: "PROCESSING" },
    });
    if (!example) return { skipped: true };
    const profile = await this.database.embeddingProfile.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { version: "desc" },
    });
    if (!profile || profile.dimensions !== 768) {
      await this.fail(example.id, example.updatedAt, "No active 768-dimension embedding profile");
      return { failed: true };
    }
    const input = knowledgeEmbeddingInput(example);
    const inputHash = createHash("sha256").update(`${profile.key}:${input}`).digest("hex");
    try {
      const provider = embeddingProviderSchema.parse(profile.provider);
      const result = await embed({
        model: embeddingModel({ provider, model: profile.model, purpose: "document" }),
        value: input,
        maxRetries: 3,
        providerOptions: embeddingProviderOptions(provider, "document"),
        telemetry: { isEnabled: false },
      });
      if (result.embedding.length !== 768) throw new Error("Embedding dimensions did not match");
      const vector = `[${result.embedding.join(",")}]`;
      const activated = await this.database.$transaction(async (database) => {
        const claimed = await database.aiKnowledgeExample.updateMany({
          where: {
            id: example.id,
            status: "DRAFT",
            embeddingStatus: "PROCESSING",
            updatedAt: example.updatedAt,
          },
          data: { status: "ACTIVE", embeddingStatus: "COMPLETED", embeddingError: null },
        });
        if (claimed.count !== 1) return false;
        await database.$executeRaw(Prisma.sql`
          INSERT INTO "ai_knowledge_embeddings"
            ("id", "knowledge_example_id", "embedding_profile_id", "input_hash", "embedding", "generated_at", "created_at", "updated_at")
          VALUES
            (${randomUUID()}, ${example.id}, ${profile.id}, ${inputHash}, ${vector}::vector, NOW(), NOW(), NOW())
          ON CONFLICT ("knowledge_example_id", "embedding_profile_id") DO UPDATE SET
            "input_hash" = EXCLUDED."input_hash",
            "embedding" = EXCLUDED."embedding",
            "generated_at" = NOW(),
            "updated_at" = NOW()
        `);
        return true;
      });
      return { activated };
    } catch (error) {
      await this.fail(
        example.id,
        example.updatedAt,
        error instanceof Error ? error.message : "Embedding generation failed",
      );
      throw error;
    }
  }

  private async fail(exampleId: string, updatedAt: Date, message: string) {
    await this.database.aiKnowledgeExample.updateMany({
      where: { id: exampleId, status: "DRAFT", embeddingStatus: "PROCESSING", updatedAt },
      data: { embeddingStatus: "FAILED", embeddingError: message.slice(0, 1_000) },
    });
  }
}

@Injectable()
export class KnowledgeEmbeddingReconciler implements OnModuleInit, OnModuleDestroy {
  private readonly database: DatabaseClient = createPrismaClient();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectQueue(workQueueNames.knowledgeEmbedding)
    private readonly queue: Queue<JobEnvelope>,
  ) {}

  onModuleInit() {
    void this.reconcile();
    this.timer = setInterval(() => void this.reconcile(), 60_000);
    this.timer.unref();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.database.$disconnect();
  }

  private async reconcile() {
    const pending = await this.database.aiKnowledgeExample.findMany({
      where: { status: "DRAFT", embeddingStatus: "PROCESSING" },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "asc" },
      take: 100,
    });
    await Promise.allSettled(
      pending.map((example) => {
        const idempotencyKey = `${example.id}:${example.updatedAt.toISOString()}`;
        return this.queue.add(
          "embed-knowledge-example",
          {
            organizationId: "platform",
            correlationId: randomUUID(),
            idempotencyKey,
            payload: { exampleId: example.id },
          },
          { jobId: createHash("sha256").update(idempotencyKey).digest("hex") },
        );
      }),
    );
  }
}
