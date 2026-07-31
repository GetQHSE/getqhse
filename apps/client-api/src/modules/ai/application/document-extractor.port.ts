export type ExtractedDocument = {
  text: string;
  pages: Array<{ pageNumber: number; text: string }>;
  metadata: Record<string, string>;
};

export abstract class DocumentExtractor {
  abstract extract(input: {
    bytes: Uint8Array;
    fileName: string;
    contentType: string;
    correlationId: string;
  }): Promise<ExtractedDocument>;
}
