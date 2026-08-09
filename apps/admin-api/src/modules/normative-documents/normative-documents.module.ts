import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { DocumentStorageService } from "./document-storage.service.js";
import { DocumentsController } from "./documents.controller.js";
import { DocumentsService } from "./documents.service.js";

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
    BullModule.registerQueue({ name: "document-processing" }, { name: "embedding-generation" }),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentStorageService],
  exports: [DocumentsService, DocumentStorageService],
})
export class NormativeDocumentsModule {}
