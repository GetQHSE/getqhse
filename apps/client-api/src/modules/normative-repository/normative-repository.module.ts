import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { TenantContextGuard } from "../auth/authorization/tenant-context.guard.js";
import {
  NormativeQueryEmbeddingPort,
  NormativeRetriever,
} from "./application/normative-retriever.port.js";
import { OpenAiQueryEmbeddingAdapter } from "./infrastructure/openai-query-embedding.adapter.js";
import { PrismaNormativeRetriever } from "./infrastructure/prisma-normative-retriever.js";
import { NormativeSearchController } from "./presentation/normative-search.controller.js";

@Module({
  imports: [AuthModule],
  controllers: [NormativeSearchController],
  providers: [
    TenantContextGuard,
    { provide: NormativeQueryEmbeddingPort, useClass: OpenAiQueryEmbeddingAdapter },
    { provide: NormativeRetriever, useClass: PrismaNormativeRetriever },
  ],
  exports: [NormativeRetriever],
})
export class NormativeRepositoryModule {}
