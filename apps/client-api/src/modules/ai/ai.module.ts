import { Module } from "@nestjs/common";

import { DocumentExtractor } from "./application/document-extractor.port.js";
import { DoclingHttpAdapter } from "./infrastructure/docling-http.adapter.js";

@Module({
  providers: [{ provide: DocumentExtractor, useClass: DoclingHttpAdapter }],
  exports: [DocumentExtractor],
})
export class AiModule {}
