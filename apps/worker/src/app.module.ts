import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { queueNames } from "./queues.js";
import { DocumentIngestionProcessor } from "./processors/document-ingestion.processor.js";
import { DocumentProcessingProcessor } from "./processors/document-processing.processor.js";
import {
  EmbeddingGenerationProcessor,
  EvidenceAnalysisProcessor,
  NotificationProcessor,
  ReportGenerationProcessor,
} from "./processors/representative.processors.js";

const redisUrl = new URL(process.env["REDIS_URL"] ?? "redis://localhost:6379");

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port || 6379),
        ...(redisUrl.password ? { password: redisUrl.password } : {}),
      },
    }),
    BullModule.registerQueue(...Object.values(queueNames).map((name) => ({ name })), {
      name: "document-processing",
    }),
  ],
  providers: [
    DocumentIngestionProcessor,
    DocumentProcessingProcessor,
    EmbeddingGenerationProcessor,
    EvidenceAnalysisProcessor,
    ReportGenerationProcessor,
    NotificationProcessor,
  ],
})
export class WorkerModule {}
