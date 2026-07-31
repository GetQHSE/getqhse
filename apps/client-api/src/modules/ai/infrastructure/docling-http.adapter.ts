import { Injectable } from "@nestjs/common";

import {
  DocumentExtractor,
  type ExtractedDocument,
} from "../application/document-extractor.port.js";

@Injectable()
export class DoclingHttpAdapter extends DocumentExtractor {
  async extract(input: {
    bytes: Uint8Array;
    fileName: string;
    contentType: string;
    correlationId: string;
  }): Promise<ExtractedDocument> {
    const form = new FormData();
    form.append(
      "file",
      new Blob([input.bytes.slice().buffer], { type: input.contentType }),
      input.fileName,
    );
    const response = await fetch(`${process.env["DOCLING_URL"]}/v1/extract`, {
      method: "POST",
      body: form,
      headers: { "x-correlation-id": input.correlationId },
    });
    if (!response.ok) throw new Error(`Docling extraction failed: ${response.status}`);
    const raw = (await response.json()) as {
      text: string;
      pages?: Array<{ page_number: number; text: string }>;
      metadata?: Record<string, string>;
    };
    return {
      text: raw.text,
      pages: (raw.pages ?? []).map((page) => ({
        pageNumber: page.page_number,
        text: page.text,
      })),
      metadata: raw.metadata ?? {},
    };
  }
}
