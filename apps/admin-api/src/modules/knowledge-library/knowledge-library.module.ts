import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { workQueueNames } from "@qhse/contracts";

import { AuthModule } from "../auth/auth.module.js";
import { KnowledgeLibraryController } from "./knowledge-library.controller.js";
import { KnowledgeLibraryService } from "./knowledge-library.service.js";

const redisUrl = new URL(process.env["REDIS_URL"] ?? "redis://localhost:6379");

@Module({
  imports: [
    AuthModule,
    BullModule.forRoot({
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port || 6379),
        ...(redisUrl.password ? { password: redisUrl.password } : {}),
      },
    }),
    BullModule.registerQueue({ name: workQueueNames.knowledgeEmbedding }),
  ],
  controllers: [KnowledgeLibraryController],
  providers: [KnowledgeLibraryService],
})
export class KnowledgeLibraryModule {}
