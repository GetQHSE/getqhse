import { z } from "zod";
import {
  documentStatuses,
  documentTypes,
  processingJobTypes,
  sourceTypes,
} from "../types/index.js";

export const createDocumentSchema = z.object({
  title: z.string().trim().min(2).max(500),
  shortTitle: z.string().trim().max(160).optional(),
  description: z.string().trim().max(10_000).optional(),
  documentType: z.enum(documentTypes),
  sourceType: z.enum(sourceTypes),
  jurisdiction: z.string().trim().max(160).optional(),
  countryCode: z.string().trim().length(2).toUpperCase().optional(),
  language: z.string().trim().min(2).max(16),
  issuingAuthority: z.string().trim().max(300).optional(),
  referenceNumber: z.string().trim().max(160).optional(),
  publicationDate: z.iso.date().optional(),
  effectiveDate: z.iso.date().optional(),
  expirationDate: z.iso.date().optional(),
  visibility: z
    .enum(["platform_internal", "organization_available", "public_reference", "restricted"])
    .default("platform_internal"),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const updateDocumentSchema = createDocumentSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field must be supplied");
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export const createVersionSchema = z.object({
  versionLabel: z.string().trim().min(1).max(160),
  revisionDate: z.iso.date().optional(),
  effectiveDate: z.iso.date().optional(),
  expirationDate: z.iso.date().optional(),
  changeSummary: z.string().trim().max(10_000).optional(),
  changeType: z.enum([
    "initial",
    "minor_revision",
    "major_revision",
    "amendment",
    "correction",
    "replacement",
    "translation",
  ]),
  originalFileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(160),
  fileSize: z.number().int().positive(),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/i),
  supersedesVersionId: z.string().min(1).optional(),
  allowDuplicate: z.boolean().default(false),
});
export type CreateVersionInput = z.infer<typeof createVersionSchema>;

export const listDocumentsSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(documentStatuses).optional(),
  documentType: z.enum(documentTypes).optional(),
  countryCode: z.string().length(2).optional(),
  language: z.string().max(16).optional(),
  issuingAuthority: z.string().max(300).optional(),
  processingStatus: z.enum(["pending", "running", "completed", "failed", "skipped"]).optional(),
  ocrUsed: z.coerce.boolean().optional(),
  hasErrors: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(["updatedAt", "title", "publicationDate", "effectiveDate"]).default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
export type ListDocumentsInput = z.infer<typeof listDocumentsSchema>;

export const uploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().min(1).max(160),
  fileSize: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const processingRequestSchema = z.object({
  fromJob: z.enum(processingJobTypes).optional(),
  force: z.boolean().default(false),
});

export const reviewIssueSchema = z.object({
  issueType: z.enum([
    "incorrect_metadata",
    "missing_pages",
    "poor_ocr",
    "wrong_classification",
    "extraction_error",
    "incorrect_structure",
    "duplicate_content",
    "version_conflict",
    "legal_review_required",
    "other",
  ]),
  severity: z.enum(["low", "medium", "high", "blocking"]),
  title: z.string().trim().min(2).max(300),
  description: z.string().trim().min(1).max(10_000),
  sourceLocation: z.record(z.string(), z.unknown()).optional(),
  processingJobId: z.string().optional(),
  assignedToUserId: z.string().optional(),
});
export type CreateReviewIssueInput = z.infer<typeof reviewIssueSchema>;

export const classificationUpdateSchema = z.object({
  taxonomyTermIds: z.array(z.string().min(1)).min(1).max(100),
  source: z.enum(["automatic", "manual"]),
  confidenceScore: z.number().min(0).max(1).optional(),
  validated: z.boolean().default(false),
});

export const metadataDecisionSchema = z.object({
  decision: z.enum(["accepted", "rejected", "edited"]),
  value: z.unknown().optional(),
});

export const relationshipSchema = z.object({
  targetDocumentId: z.string().min(1),
  sourceVersionId: z.string().min(1).optional(),
  targetVersionId: z.string().min(1).optional(),
  relationshipType: z.enum([
    "supersedes",
    "replaces",
    "amends",
    "corrects",
    "references",
    "implements",
    "depends_on",
    "translated_from",
    "related_to",
    "annex_of",
  ]),
  description: z.string().max(2_000).optional(),
});
