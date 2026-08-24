import { Module } from "@nestjs/common";

import {
  NormativeQueryEmbeddingPort,
  NormativeSearchTester,
} from "./application/normative-search-testing.port.js";
import { OpenAiQueryEmbeddingAdapter } from "./infrastructure/openai-query-embedding.adapter.js";
import { PrismaNormativeSearchTester } from "./infrastructure/prisma-normative-search-tester.js";
import { NormativeSearchTestingController } from "./presentation/normative-search-testing.controller.js";

@Module({
  controllers: [NormativeSearchTestingController],
  providers: [
    { provide: NormativeQueryEmbeddingPort, useClass: OpenAiQueryEmbeddingAdapter },
    { provide: NormativeSearchTester, useClass: PrismaNormativeSearchTester },
  ],
})
export class NormativeSearchTestingModule {}
