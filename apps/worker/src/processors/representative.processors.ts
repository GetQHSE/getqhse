import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import type { JobEnvelope } from "@qhse/contracts";
import { openai } from "@ai-sdk/openai";
import {
  createPrismaClient,
  embeddableRevisionFilter,
  indexableProfileStatuses,
  Prisma,
  unindexedSearchableChunkFilter,
  type DatabaseClient,
} from "@qhse/database";
import { embeddingInputHash } from "@qhse/knowledge";
import { embedMany } from "ai";
import { randomUUID } from "node:crypto";

import { queueNames } from "../queues.js";

abstract class RepresentativeProcessor extends WorkerHost {
  async process(job: Job<JobEnvelope>) {
    await job.updateProgress({ phase: "processing", progress: 50 });
    await this.perform(job.data);
    await job.updateProgress({ phase: "completed", progress: 100 });
    return { processed: true, idempotencyKey: job.data.idempotencyKey };
  }

  protected abstract perform(envelope: JobEnvelope): Promise<void>;
}

@Processor(queueNames.embeddingGeneration, { concurrency: 4 })
export class EmbeddingGenerationProcessor extends RepresentativeProcessor {
  private readonly database: DatabaseClient = createPrismaClient();

  protected async perform(envelope: JobEnvelope): Promise<void> {
    if (process.env["NORMATIVE_RAG_ENABLED"] !== "true") {
      throw new Error("Normative RAG is disabled");
    }
    const versionId =
      typeof envelope.payload["versionId"] === "string" ? envelope.payload["versionId"] : null;
    const requestedProfileId =
      typeof envelope.payload["profileId"] === "string" ? envelope.payload["profileId"] : null;
    const profile = requestedProfileId
      ? await this.database.embeddingProfile.findUnique({ where: { id: requestedProfileId } })
      : await this.database.embeddingProfile.findFirst({
          where: { status: { in: [...indexableProfileStatuses] } },
          orderBy: [{ status: "asc" }, { version: "desc" }],
        });
    if (!profile) throw new Error("No embedding profile is available");
    if (profile.provider !== "openai" || profile.dimensions !== 768) {
      throw new Error("The embedding profile must use OpenAI with 768 dimensions");
    }

    const chunks = await this.database.documentChunk.findMany({
      where: {
        ...(versionId ? { documentVersionId: versionId } : {}),
        version: embeddableRevisionFilter,
      },
      select: {
        id: true,
        searchText: true,
        embeddings: {
          where: { embeddingProfileId: profile.id },
          select: { inputHash: true },
          take: 1,
        },
      },
      orderBy: [{ documentVersionId: "asc" }, { chunkIndex: "asc" }],
    });
    const pending = chunks.filter(
      (chunk) =>
        chunk.embeddings[0]?.inputHash !== embeddingInputHash(profile.key, chunk.searchText),
    );
    const batchSize = Math.min(Math.max(Number(process.env["EMBEDDING_BATCH_SIZE"] ?? 64), 1), 100);
    for (let offset = 0; offset < pending.length; offset += batchSize) {
      const batch = pending.slice(offset, offset + batchSize);
      const result = await embedMany({
        model: openai.embedding(profile.model),
        values: batch.map(({ searchText }) => searchText),
        maxParallelCalls: 2,
        maxRetries: 3,
        providerOptions: {
          openai: {
            dimensions: 768,
          },
        },
        telemetry: { isEnabled: false },
      });
      await this.database.$transaction(
        batch.flatMap((chunk, index) => {
          const embedding = result.embeddings[index];
          if (!embedding || embedding.length !== 768) {
            throw new Error(`Embedding dimensions did not match profile for chunk ${chunk.id}`);
          }
          const vector = `[${embedding.join(",")}]`;
          const inputHash = embeddingInputHash(profile.key, chunk.searchText);
          return [
            this.database.$executeRaw(
              Prisma.sql`INSERT INTO "document_embeddings"
                ("id", "document_chunk_id", "embedding_profile_id", "input_hash", "embedding", "generated_at", "created_at", "updated_at")
                VALUES (${randomUUID()}, ${chunk.id}, ${profile.id}, ${inputHash}, ${vector}::vector, NOW(), NOW(), NOW())
                ON CONFLICT ("document_chunk_id", "embedding_profile_id") DO UPDATE SET
                  "input_hash" = EXCLUDED."input_hash",
                  "embedding" = EXCLUDED."embedding",
                  "generated_at" = NOW(),
                  "updated_at" = NOW()`,
            ),
            this.database.documentChunk.update({
              where: { id: chunk.id },
              data: { embeddingStatus: "COMPLETED" },
            }),
          ];
        }),
      );
    }

    // Readiness is judged against exactly the revisions the retriever can
    // return, so a READY profile always satisfies the activation gate.
    const missing = await this.database.documentChunk.count({
      where: unindexedSearchableChunkFilter(profile.id),
    });
    if (!missing && profile.status === "BUILDING") {
      await this.database.embeddingProfile.update({
        where: { id: profile.id },
        data: { status: "READY" },
      });
      return;
    }
    // Content published after the profile reached READY leaves it incomplete.
    // Without this the profile would stay READY forever while activation keeps
    // rejecting it, with no way back to BUILDING short of a new profile.
    if (missing && profile.status === "READY") {
      await this.database.embeddingProfile.update({
        where: { id: profile.id },
        data: { status: "BUILDING" },
      });
    }
  }
}

@Processor(queueNames.evidenceAnalysis, { concurrency: 2 })
export class EvidenceAnalysisProcessor extends RepresentativeProcessor {
  protected async perform(): Promise<void> {}
}

@Processor(queueNames.reportGeneration, { concurrency: 2 })
export class ReportGenerationProcessor extends RepresentativeProcessor {
  protected async perform(): Promise<void> {}
}

@Processor(queueNames.notifications, { concurrency: 8 })
export class NotificationProcessor extends RepresentativeProcessor {
  protected async perform(): Promise<void> {}
}
