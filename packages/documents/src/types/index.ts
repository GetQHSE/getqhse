export const documentTypes = [
  "standard",
  "law",
  "dahir",
  "decree",
  "order",
  "circular",
  "regulation",
  "guideline",
  "procedure",
  "manual",
  "checklist",
  "template",
  "methodology",
  "technical_reference",
  "knowledge",
  "other",
] as const;
export type DocumentType = (typeof documentTypes)[number];

export const sourceTypes = [
  "official",
  "licensed",
  "internal",
  "customer_provided",
  "public_reference",
  "other",
] as const;
export type SourceType = (typeof sourceTypes)[number];

export const documentStatuses = [
  "draft",
  "uploaded",
  "processing",
  "review_required",
  "validated",
  "published",
  "processing_failed",
  "archived",
] as const;
export type DocumentStatus = (typeof documentStatuses)[number];

export const processingJobTypes = [
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
] as const;
export type ProcessingJobType = (typeof processingJobTypes)[number];
export type ProcessingJobStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type DocumentRole =
  "super_admin" | "platform_admin" | "content_manager" | "support" | "user";

export type DocumentAction =
  | "view"
  | "create"
  | "edit"
  | "process"
  | "review"
  | "validate"
  | "publish"
  | "archive"
  | "delete"
  | "override_duplicate";

export type SourceLocation = {
  fileId?: string;
  page?: number;
  sectionId?: string;
  paragraph?: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
};
