import type { ProcessingJobType } from "../types/index.js";

export const processingPipeline: readonly ProcessingJobType[] = [
  "security_scan",
  "file_validation",
  "text_extraction",
  "ocr",
  "metadata_detection",
  "language_detection",
  "structure_detection",
  "classification",
  "chunking",
  "quality_checks",
  "preview_generation",
  "embedding_preparation",
];

export type ProcessingContext = {
  documentId: string;
  versionId: string;
  jobId: string;
  storageKey: string;
  configuration: Record<string, unknown>;
};

export type ProcessingResult = {
  status: "completed" | "skipped";
  outputLocation?: string;
  outputMetadata?: Record<string, unknown>;
  qualityScore?: number;
};

export interface DocumentProcessingProvider {
  readonly jobType: ProcessingJobType;
  readonly workerVersion: string;
  process(context: ProcessingContext): Promise<ProcessingResult>;
}

export function processingIdempotencyKey(
  versionId: string,
  jobType: ProcessingJobType,
  generation = 1,
): string {
  return `${versionId}:${jobType}:${generation}`;
}

export function shouldRunOcr(input: {
  extractableCharacters: number;
  pageCount: number;
  textQuality: number;
}): boolean {
  if (input.pageCount <= 0) return true;
  const charactersPerPage = input.extractableCharacters / input.pageCount;
  return charactersPerPage < 80 || input.textQuality < 0.55;
}
