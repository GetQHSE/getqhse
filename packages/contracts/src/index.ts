import {
  profileFieldKeySchema,
  profileFieldSourceSchema,
  profileFieldStatusSchema,
  profileStatusSchema,
} from "@qhse/profile";
import { z } from "zod";

export const idSchema = z.string().min(1).max(64);
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationMetaSchema = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  requestId: z.string(),
  timestamp: isoDateTimeSchema,
  path: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

const tenantEntitySchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const organizationSchema = z.object({
  id: idSchema,
  name: z.string().min(2).max(160),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export const createOrganizationSchema = organizationSchema.pick({ name: true, slug: true });
export type Organization = z.infer<typeof organizationSchema>;
export type CreateOrganization = z.infer<typeof createOrganizationSchema>;

export const siteSchema = tenantEntitySchema.extend({
  name: z.string().min(2).max(160),
  code: z.string().min(1).max(32),
  address: z.string().max(500).nullable(),
});
export const createSiteSchema = siteSchema.pick({ name: true, code: true, address: true });
export type Site = z.infer<typeof siteSchema>;
export type CreateSite = z.infer<typeof createSiteSchema>;

export const supportedCountryCodeSchema = z.enum(["MA", "FR", "DZ", "TN", "SN", "CI"]);
export const projectEntityTypeSchema = z.enum([
  "COMPANY",
  "SCHOOL",
  "UNIVERSITY",
  "INSTITUTION",
  "ASSOCIATION",
  "PUBLIC_ADMINISTRATION",
  "INDUSTRIAL_SITE",
  "OTHER",
]);
export const projectStatusSchema = z.enum([
  "EMPTY",
  "PROFILE_IN_PROGRESS",
  "PROFILE_REVIEW",
  "READY_FOR_ANALYSIS",
  "ANALYSIS_IN_PROGRESS",
  "REVIEW_REQUIRED",
  "COMPLETED",
  "ARCHIVED",
]);
export const projectActivityInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  isPrimary: z.boolean().optional(),
});
export const projectActivitySchema = z.object({
  id: idSchema,
  name: z.string(),
  isPrimary: z.boolean(),
});
export const projectSchema = tenantEntitySchema.extend({
  createdById: idSchema,
  name: z.string().min(2).max(160),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  logoUrl: z.url().nullable(),
  entityType: projectEntityTypeSchema,
  countryCode: supportedCountryCodeSchema,
  standardCode: z.literal("ISO_9001"),
  description: z.string().max(2_000).nullable(),
  status: projectStatusSchema,
  activities: z.array(projectActivitySchema),
});
export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(160),
  logoUrl: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().nullable().optional(),
  ),
  entityType: projectEntityTypeSchema,
  countryCode: supportedCountryCodeSchema.default("MA"),
  activities: z.array(projectActivityInputSchema).min(1).max(30),
  description: z.string().trim().max(2_000).nullable().optional(),
});
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type ProjectEntityType = z.infer<typeof projectEntityTypeSchema>;
export type Project = z.infer<typeof projectSchema>;
export type CreateProject = z.infer<typeof createProjectSchema>;
export type ProjectActivity = z.infer<typeof projectActivitySchema>;

export const paginatedProjectsSchema = z.object({
  data: z.array(projectSchema),
  meta: paginationMetaSchema,
});
export type PaginatedProjects = z.infer<typeof paginatedProjectsSchema>;

export const projectProfileFieldSchema = z.object({
  id: idSchema.nullable(),
  key: profileFieldKeySchema,
  value: z.unknown().nullable(),
  status: profileFieldStatusSchema,
  source: profileFieldSourceSchema.nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  notApplicableReason: z.string().nullable(),
  confirmedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema.nullable(),
});
export type ProjectProfileField = z.infer<typeof projectProfileFieldSchema>;

export const projectProfileQuestionSchema = z.object({
  key: profileFieldKeySchema,
  section: z.enum([
    "IDENTITY_ACTIVITY",
    "SCOPE_GEOGRAPHY",
    "OPERATIONS_RESOURCES",
    "EXTERNAL_CONTEXT",
    "INTERESTED_PARTIES",
    "STRATEGY_OBJECTIVES",
  ]),
  prompt: z.string(),
  required: z.boolean(),
  regulatoryCritical: z.boolean(),
  allowNotApplicable: z.boolean(),
});
export type ProjectProfileQuestion = z.infer<typeof projectProfileQuestionSchema>;

export const profileCompletionSchema = z.object({
  answeredRequired: z.number().int().nonnegative(),
  totalRequired: z.number().int().positive(),
  completenessPercent: z.number().int().min(0).max(100),
  answeredRegulatory: z.number().int().nonnegative(),
  totalRegulatory: z.number().int().positive(),
  regulatoryReadiness: z.number().int().min(0).max(100),
  missingRequiredKeys: z.array(profileFieldKeySchema),
  missingRegulatoryKeys: z.array(profileFieldKeySchema),
});

export const projectProfileSchema = z.object({
  project: projectSchema,
  profile: z.object({
    id: idSchema,
    schemaVersion: z.number().int().positive(),
    revision: z.number().int().positive(),
    status: profileStatusSchema,
    completedAt: isoDateTimeSchema.nullable(),
    lastReviewedAt: isoDateTimeSchema.nullable(),
    nextReviewAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  }),
  fields: z.array(projectProfileFieldSchema),
  completion: profileCompletionSchema,
  nextQuestion: projectProfileQuestionSchema.nullable(),
});
export type ProjectProfile = z.infer<typeof projectProfileSchema>;

export const projectProfileAnswerInputSchema = z
  .object({
    key: profileFieldKeySchema,
    value: z.unknown().optional(),
    status: z.enum(["ANSWERED", "NOT_APPLICABLE"]).default("ANSWERED"),
    notApplicableReason: z.string().trim().min(3).max(1_000).optional(),
  })
  .superRefine((answer, context) => {
    if (answer.status === "ANSWERED" && answer.value === undefined) {
      context.addIssue({ code: "custom", path: ["value"], message: "value is required" });
    }
    if (answer.status === "NOT_APPLICABLE" && !answer.notApplicableReason) {
      context.addIssue({
        code: "custom",
        path: ["notApplicableReason"],
        message: "notApplicableReason is required",
      });
    }
  });

export const updateProjectProfileSchema = z.object({
  revision: z.number().int().positive(),
  answers: z.array(projectProfileAnswerInputSchema).min(1).max(33),
  changeReason: z.string().trim().max(1_000).optional(),
});
export type UpdateProjectProfile = z.infer<typeof updateProjectProfileSchema>;

export const portableProjectProfileFieldSchema = z
  .strictObject({
    key: profileFieldKeySchema,
    status: z.enum(["ANSWERED", "NOT_APPLICABLE"]),
    value: z.unknown().optional(),
    notApplicableReason: z.string().trim().min(3).max(1_000).optional(),
  })
  .superRefine((field, context) => {
    if (field.status === "ANSWERED" && field.value === undefined) {
      context.addIssue({ code: "custom", path: ["value"], message: "value is required" });
    }
    if (field.status === "NOT_APPLICABLE" && !field.notApplicableReason) {
      context.addIssue({
        code: "custom",
        path: ["notApplicableReason"],
        message: "notApplicableReason is required",
      });
    }
  });

export const portableProjectProfileSchema = z
  .strictObject({
    format: z.literal("qhse-project-profile"),
    formatVersion: z.literal(1),
    profileSchemaVersion: z.number().int().positive(),
    exportedAt: isoDateTimeSchema,
    sourceProject: z.strictObject({
      name: z.string().trim().min(1).max(160),
      countryCode: supportedCountryCodeSchema,
      standardCode: z.literal("ISO_9001"),
    }),
    fields: z.array(portableProjectProfileFieldSchema).min(1).max(33),
  })
  .superRefine((document, context) => {
    const seen = new Set<string>();
    for (const [index, field] of document.fields.entries()) {
      if (seen.has(field.key)) {
        context.addIssue({
          code: "custom",
          path: ["fields", index, "key"],
          message: `Duplicate profile field: ${field.key}`,
        });
      }
      seen.add(field.key);
    }
  });
export type PortableProjectProfile = z.infer<typeof portableProjectProfileSchema>;

export const importProjectProfileSchema = z.strictObject({
  revision: z.number().int().positive(),
  document: portableProjectProfileSchema,
});
export type ImportProjectProfile = z.infer<typeof importProjectProfileSchema>;

export const aiModuleSchema = z.enum(["PROFILE_COMPLETION", "NORMATIVE_WATCH"]);
export type AiModule = z.infer<typeof aiModuleSchema>;

export const projectProfileChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  messageId: z.string().trim().min(1).max(128).optional(),
  conversationId: idSchema.optional(),
  language: z.enum(["fr", "ar"]).default("fr"),
  module: aiModuleSchema.default("PROFILE_COMPLETION"),
  attachmentIds: z.array(idSchema).max(10).default([]),
});
export type ProjectProfileChatRequest = z.infer<typeof projectProfileChatRequestSchema>;

export const projectProfileMessageSchema = z.object({
  id: idSchema,
  role: z.enum(["USER", "ASSISTANT", "SYSTEM", "TOOL"]),
  content: z.string(),
  clientMessageId: z.string().nullable().optional(),
  replyToMessageId: idSchema.nullable().optional(),
  attachments: z
    .array(
      z.object({
        id: idSchema,
        fileName: z.string(),
        contentType: z.string(),
        sizeBytes: z.number().int().nonnegative(),
        purpose: z.enum(["CHAT_ATTACHMENT", "VOICE_NOTE", "EVIDENCE"]),
      }),
    )
    .optional(),
  createdAt: isoDateTimeSchema,
});
export type ProjectProfileMessage = z.infer<typeof projectProfileMessageSchema>;

export const projectProfileConversationSchema = z.object({
  id: idSchema,
  status: z.enum(["ACTIVE", "COMPLETED", "ABANDONED"]),
  language: z.enum(["fr", "ar"]),
  currentQuestionKey: profileFieldKeySchema.nullable(),
  messages: z.array(projectProfileMessageSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type ProjectProfileConversation = z.infer<typeof projectProfileConversationSchema>;

export const projectProfileChatResponseSchema = z.object({
  conversationId: idSchema,
  message: projectProfileMessageSchema,
  acceptedKeys: z.array(profileFieldKeySchema),
  rejectedAnswers: z.array(z.object({ key: profileFieldKeySchema, reason: z.string() })),
  profile: projectProfileSchema,
});
export type ProjectProfileChatResponse = z.infer<typeof projectProfileChatResponseSchema>;

const uiTextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().max(4_000),
});

const uiFilePartSchema = z.object({
  type: z.literal("file"),
  mediaType: z.string().max(200),
  filename: z.string().max(500).optional(),
  url: z.string().max(2_000).optional(),
});

export const projectProfileUiMessageSchema = z.object({
  id: z.string().trim().min(1).max(128),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.union([uiTextPartSchema, uiFilePartSchema])).max(50),
});

export const projectProfileStreamRequestSchema = z.object({
  id: idSchema.optional(),
  conversationId: idSchema.optional(),
  messages: z.array(projectProfileUiMessageSchema).min(1).max(100),
  trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
  messageId: z.string().max(128).optional(),
  language: z.enum(["fr", "ar"]).default("fr"),
  module: aiModuleSchema.default("PROFILE_COMPLETION"),
  attachmentIds: z.array(idSchema).max(10).default([]),
});
export type ProjectProfileStreamRequest = z.infer<typeof projectProfileStreamRequestSchema>;

export const filePurposeSchema = z.enum(["CHAT_ATTACHMENT", "VOICE_NOTE", "EVIDENCE"]);
export const fileUploadStatusSchema = z.enum(["PENDING", "READY", "REJECTED"]);

export const createFileUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(500),
  contentType: z.string().trim().min(3).max(200),
  sizeBytes: z.number().int().positive().max(100_000_000),
  checksum: z.string().regex(/^[a-fA-F0-9]{64}$/),
  purpose: filePurposeSchema.default("CHAT_ATTACHMENT"),
});
export type CreateFileUpload = z.infer<typeof createFileUploadSchema>;

export const fileObjectSchema = z.object({
  id: idSchema,
  originalName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  checksum: z.string(),
  purpose: filePurposeSchema,
  uploadStatus: fileUploadStatusSchema,
  verifiedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export const fileUploadResponseSchema = z.object({
  file: fileObjectSchema,
  upload: z.object({ url: z.url(), expiresAt: isoDateTimeSchema }),
});
export type FileUploadResponse = z.infer<typeof fileUploadResponseSchema>;

export const fileTranscriptionSchema = z.object({
  id: idSchema,
  fileId: idSchema,
  model: z.string(),
  language: z.string().nullable(),
  text: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  status: z.enum(["PENDING", "COMPLETED", "FAILED"]),
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});
export type FileTranscription = z.infer<typeof fileTranscriptionSchema>;

export const completeProjectProfileSchema = z.object({
  revision: z.number().int().positive(),
});

export const projectProfileSnapshotSchema = z.object({
  id: idSchema,
  sequence: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
  contentHash: z.string().length(64),
  completenessPercent: z.number().int().min(0).max(100),
  regulatoryReadiness: z.number().int().min(0).max(100),
  createdAt: isoDateTimeSchema,
});
export type ProjectProfileSnapshot = z.infer<typeof projectProfileSnapshotSchema>;

export const onboardingStatusSchema = z.object({
  authenticated: z.boolean(),
  organizationsCount: z.number().int().nonnegative(),
  activeOrganization: z
    .object({
      id: idSchema,
      name: z.string().min(1),
      slug: z.string().min(1),
      icon: z.string().nullable(),
      countryCode: supportedCountryCodeSchema,
    })
    .nullable(),
  activeOrganizationProjectCount: z.number().int().nonnegative(),
  nextStep: z.enum([
    "SIGN_IN",
    "CREATE_ORGANIZATION",
    "SELECT_ORGANIZATION",
    "CREATE_PROJECT",
    "WAIT_FOR_PROJECT",
    "OPEN_PROJECTS",
  ]),
});
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

export const auditStatusSchema = z.enum([
  "DRAFT",
  "PLANNED",
  "IN_PROGRESS",
  "IN_REVIEW",
  "COMPLETED",
  "CANCELLED",
]);
export const auditSchema = tenantEntitySchema.extend({
  siteId: idSchema,
  campaignId: idSchema.nullable(),
  title: z.string().min(2).max(200),
  status: auditStatusSchema,
  startsAt: isoDateTimeSchema.nullable(),
  endsAt: isoDateTimeSchema.nullable(),
});
export const createAuditSchema = auditSchema.pick({
  siteId: true,
  campaignId: true,
  title: true,
  startsAt: true,
  endsAt: true,
});
export type Audit = z.infer<typeof auditSchema>;
export type CreateAudit = z.infer<typeof createAuditSchema>;

export const evidenceSchema = tenantEntitySchema.extend({
  auditId: idSchema,
  fileId: idSchema.nullable(),
  kind: z.enum(["DOCUMENT", "PHOTO", "NOTE", "LINK"]),
  summary: z.string().max(2_000).nullable(),
});
export const createEvidenceSchema = evidenceSchema.pick({
  auditId: true,
  fileId: true,
  kind: true,
  summary: true,
});
export type Evidence = z.infer<typeof evidenceSchema>;
export type CreateEvidence = z.infer<typeof createEvidenceSchema>;

export const findingSeveritySchema = z.enum(["OBSERVATION", "MINOR", "MAJOR", "CRITICAL"]);
export const findingSchema = tenantEntitySchema.extend({
  auditId: idSchema,
  title: z.string().min(2).max(200),
  description: z.string().min(1).max(10_000),
  severity: findingSeveritySchema,
  status: z.enum(["OPEN", "IN_PROGRESS", "VERIFIED", "CLOSED"]),
});
export const createFindingSchema = findingSchema.pick({
  auditId: true,
  title: true,
  description: true,
  severity: true,
});
export type Finding = z.infer<typeof findingSchema>;
export type CreateFinding = z.infer<typeof createFindingSchema>;

export const normativeSearchRequestSchema = z.object({
  query: z.string().trim().min(3).max(1_000),
  asOf: z.iso.date().optional(),
  languages: z
    .array(z.enum(["fr", "ar"]))
    .min(1)
    .max(2)
    .default(["fr", "ar"]),
  documentFamilies: z
    .array(z.enum(["standard", "regulation"]))
    .min(1)
    .max(2)
    .optional(),
  limit: z.number().int().min(1).max(20).default(10),
});
export type NormativeSearchRequest = z.infer<typeof normativeSearchRequestSchema>;

export const normativeSearchResultSchema = z.object({
  sourceId: idSchema,
  documentId: idSchema,
  revisionId: idSchema,
  chunkId: idSchema,
  documentTitle: z.string(),
  referenceNumber: z.string().nullable(),
  revisionLabel: z.string(),
  sourceEdition: z.string().nullable(),
  jurisdiction: z.string().nullable(),
  countryCode: z.string().nullable(),
  language: z.enum(["fr", "ar"]),
  documentFamily: z.enum(["standard", "regulation"]),
  provisionType: z.enum(["clause", "article", "definition", "annex", "table", "note", "section"]),
  provisionIdentifier: z.string().nullable(),
  headingPath: z.array(z.string()),
  pageStart: z.number().int().positive().nullable(),
  pageEnd: z.number().int().positive().nullable(),
  excerpt: z.string().max(1_201),
  scores: z.object({
    keyword: z.number().nullable(),
    semantic: z.number().nullable(),
    fusion: z.number(),
  }),
  citationLabel: z.string(),
});
export type NormativeSearchResult = z.infer<typeof normativeSearchResultSchema>;

export const normativeSearchResponseSchema = z.object({
  results: z.array(normativeSearchResultSchema),
  asOf: z.iso.date(),
  embeddingProfile: z.object({ id: idSchema, key: z.string(), model: z.string() }),
});
export type NormativeSearchResponse = z.infer<typeof normativeSearchResponseSchema>;

// Same retrieval as normativeSearch, but for platform operators diagnosing what the AI is
// actually retrieving: the full chunk content instead of a citation-bounded excerpt.
export const adminNormativeSearchResultSchema = normativeSearchResultSchema
  .omit({ excerpt: true })
  .extend({ content: z.string() });
export type AdminNormativeSearchResult = z.infer<typeof adminNormativeSearchResultSchema>;

export const adminNormativeSearchResponseSchema = z.object({
  results: z.array(adminNormativeSearchResultSchema),
  asOf: z.iso.date(),
  embeddingProfile: z.object({ id: idSchema, key: z.string(), model: z.string() }),
});
export type AdminNormativeSearchResponse = z.infer<typeof adminNormativeSearchResponseSchema>;

export const regulatoryWatchStatusSchema = z.enum([
  "NOT_STARTED",
  "ANALYZING",
  "AWAITING_CLARIFICATION",
  "REVIEW_REQUIRED",
  "ACTIVE",
  "STALE",
  "FAILED",
]);
export const regulatoryAnalysisStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "AWAITING_CLARIFICATION",
  "PARTIAL",
  "READY_FOR_REVIEW",
  "COMPLETED",
  "SUPERSEDED",
  "FAILED",
]);
export const regulatoryChangeTypeSchema = z.enum([
  "ADDED",
  "UNCHANGED",
  "MODIFIED",
  "REMOVAL_PROPOSED",
]);
export const regulatoryDecisionSourceSchema = z.enum(["SYSTEM", "HUMAN"]);
export const regulatoryRequirementStatusSchema = z.enum([
  "READY",
  "SOURCE_REVIEW_REQUIRED",
  "NOT_REQUIRED",
]);
export const regulatoryRequirementSourceSchema = z.enum(["AI", "HUMAN", "CARRIED_FORWARD"]);
export const regulatorySourceTypeSchema = z.enum(["PLATFORM_PROVISION", "DISCOVERED_LAW"]);
export const regulatoryRunTriggerSchema = z.enum(["MANUAL", "DOCUMENT_REVISION"]);
export const regulatoryApplicabilitySchema = z.enum(["APPLICABLE", "TO_CONFIRM", "NOT_APPLICABLE"]);
export const assessmentResultSchema = z.enum([
  "CONFORMING",
  "PARTIAL",
  "NON_CONFORMING",
  "NOT_ASSESSED",
]);
export const regulatoryAiEvaluationStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
]);
export const regulatoryAnalysisReviewOutcomeSchema = z.enum(["SUBMITTED", "SKIPPED"]);
/** A PENDING or RUNNING AI assessment untouched for this long belongs to a pass that died.
 *  Both the API (when deciding what a re-run may reset) and the web client (when deciding
 *  whether a pass is still live) read it, so they can never disagree about what "in progress"
 *  means. Comfortably above one model timeout plus BullMQ's exponential backoff. */
export const staleAiEvaluationMs = 10 * 60_000;

export const startRegulatoryAnalysisSchema = z.object({
  asOf: z.iso.date().optional(),
  languages: z
    .array(z.enum(["fr", "ar"]))
    .min(1)
    .max(2)
    .default(["fr", "ar"]),
});
export type StartRegulatoryAnalysis = z.infer<typeof startRegulatoryAnalysisSchema>;

export const regulatoryClarificationAnswerSchema = z.object({
  key: z.string().trim().min(1).max(120),
  answer: z.unknown(),
});
export const answerRegulatoryClarificationsSchema = z.object({
  revision: z.number().int().nonnegative(),
  answers: z.array(regulatoryClarificationAnswerSchema).min(1).max(5),
});
export type AnswerRegulatoryClarifications = z.infer<typeof answerRegulatoryClarificationsSchema>;

export const reviewRegulatoryAnalysisSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("SUBMITTED"),
      rating: z.number().int().min(0).max(5),
      comment: z.string().trim().max(4_000).nullable().optional(),
    })
    .strict(),
  z.object({ outcome: z.literal("SKIPPED") }).strict(),
]);
export type ReviewRegulatoryAnalysis = z.infer<typeof reviewRegulatoryAnalysisSchema>;

export const aiKnowledgeFeatures = ["DISCOVERY", "CONFORMITY_EVALUATION"] as const;
export const aiKnowledgeFeatureSchema = z.enum(aiKnowledgeFeatures);
export type AiKnowledgeFeature = z.infer<typeof aiKnowledgeFeatureSchema>;
export const aiKnowledgeStatuses = ["DRAFT", "ACTIVE"] as const;
export const aiKnowledgeStatusSchema = z.enum(aiKnowledgeStatuses);
export type AiKnowledgeStatus = z.infer<typeof aiKnowledgeStatusSchema>;
export const aiKnowledgeSources = ["CUSTOMER_REVIEW", "HUMAN_CONFIRMATION", "ADMIN"] as const;
export const aiKnowledgeSourceSchema = z.enum(aiKnowledgeSources);
export type AiKnowledgeSource = z.infer<typeof aiKnowledgeSourceSchema>;
export const aiKnowledgeEmbeddingStatuses = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
] as const;
export const aiKnowledgeEmbeddingStatusSchema = z.enum(aiKnowledgeEmbeddingStatuses);
export type AiKnowledgeEmbeddingStatus = z.infer<typeof aiKnowledgeEmbeddingStatusSchema>;
export const aiKnowledgeEvaluationSignals = ["CORRECTION", "COMMENT"] as const;
export const aiKnowledgeEvaluationSignalSchema = z.enum(aiKnowledgeEvaluationSignals);
export type AiKnowledgeEvaluationSignal = z.infer<typeof aiKnowledgeEvaluationSignalSchema>;

const promptSafeText = (minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .superRefine((value, context) => {
      if (/https?:\/\/|www\./iu.test(value)) {
        context.addIssue({ code: "custom", message: "URLs are not allowed in knowledge content" });
      }
      if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u.test(value)) {
        context.addIssue({
          code: "custom",
          message: "Email addresses are not allowed in knowledge content",
        });
      }
    });

export const aiKnowledgeLawSchema = z
  .object({
    reference: promptSafeText(1, 200).nullable(),
    title: promptSafeText(2, 300),
    reason: promptSafeText(10, 1_000),
  })
  .strict();

export const aiDiscoveryKnowledgePayloadSchema = z
  .object({
    includedLaws: z.array(aiKnowledgeLawSchema).max(50),
    excludedLaws: z.array(aiKnowledgeLawSchema).max(50),
  })
  .strict();
export type AiDiscoveryKnowledgePayload = z.infer<typeof aiDiscoveryKnowledgePayloadSchema>;

export const aiEvaluationKnowledgePayloadSchema = z
  .object({
    lawReference: promptSafeText(1, 200).nullable(),
    lawTitle: promptSafeText(2, 300),
    requirementSummary: promptSafeText(10, 2_000),
    rationale: promptSafeText(10, 2_000),
    remediationGuidance: promptSafeText(10, 2_000).nullable(),
  })
  .strict();
export type AiEvaluationKnowledgePayload = z.infer<typeof aiEvaluationKnowledgePayloadSchema>;

const aiKnowledgeBaseShape = {
  title: promptSafeText(2, 200),
  scenarioSummary: promptSafeText(10, 2_000),
  guidance: promptSafeText(10, 2_000).nullable().default(null),
  jurisdiction: z.string().trim().toUpperCase().length(2),
  language: z.enum(["fr", "ar"]),
  tags: z.array(promptSafeText(1, 60)).max(20).default([]),
};

export const createAiDiscoveryKnowledgeExampleSchema = z
  .object({
    feature: z.literal("DISCOVERY"),
    ...aiKnowledgeBaseShape,
    rating: z.number().int().min(0).max(5).nullable().default(null),
    payload: aiDiscoveryKnowledgePayloadSchema,
  })
  .strict();
export const createAiEvaluationKnowledgeExampleSchema = z
  .object({
    feature: z.literal("CONFORMITY_EVALUATION"),
    ...aiKnowledgeBaseShape,
    expectedResult: assessmentResultSchema.exclude(["NOT_ASSESSED"]),
    evaluationSignal: aiKnowledgeEvaluationSignalSchema,
    payload: aiEvaluationKnowledgePayloadSchema,
  })
  .strict();
export const createAiKnowledgeExampleSchema = z.discriminatedUnion("feature", [
  createAiDiscoveryKnowledgeExampleSchema,
  createAiEvaluationKnowledgeExampleSchema,
]);
export type CreateAiKnowledgeExample = z.infer<typeof createAiKnowledgeExampleSchema>;

export const updateAiKnowledgeExampleSchema = z
  .object({
    title: aiKnowledgeBaseShape.title.optional(),
    scenarioSummary: aiKnowledgeBaseShape.scenarioSummary.optional(),
    guidance: aiKnowledgeBaseShape.guidance.optional(),
    jurisdiction: aiKnowledgeBaseShape.jurisdiction.optional(),
    language: aiKnowledgeBaseShape.language.optional(),
    tags: aiKnowledgeBaseShape.tags.optional(),
    rating: z.number().int().min(0).max(5).nullable().optional(),
    expectedResult: assessmentResultSchema.exclude(["NOT_ASSESSED"]).optional(),
    evaluationSignal: aiKnowledgeEvaluationSignalSchema.optional(),
    payload: z
      .union([aiDiscoveryKnowledgePayloadSchema, aiEvaluationKnowledgePayloadSchema])
      .optional(),
  })
  .strict();
export type UpdateAiKnowledgeExample = z.infer<typeof updateAiKnowledgeExampleSchema>;

export const listAiKnowledgeExamplesSchema = z
  .object({
    feature: aiKnowledgeFeatureSchema,
    search: z.string().trim().max(200).optional(),
    status: aiKnowledgeStatusSchema.optional(),
    source: aiKnowledgeSourceSchema.optional(),
    jurisdiction: z.string().trim().toUpperCase().length(2).optional(),
    language: z.enum(["fr", "ar"]).optional(),
    tag: z.string().trim().max(60).optional(),
    embeddingStatus: aiKnowledgeEmbeddingStatusSchema.optional(),
    rating: z.coerce.number().int().min(0).max(5).optional(),
    expectedResult: assessmentResultSchema.exclude(["NOT_ASSESSED"]).optional(),
    evaluationSignal: aiKnowledgeEvaluationSignalSchema.optional(),
    page: z.coerce.number().int().positive().max(10_000).default(1),
    pageSize: z.coerce.number().int().min(10).max(100).default(25),
  })
  .strict();
export type ListAiKnowledgeExamples = z.infer<typeof listAiKnowledgeExamplesSchema>;

export const decideRegulatoryCandidateSchema = z.object({
  watchRevision: z.number().int().positive(),
  decision: z.enum(["APPLICABLE", "NOT_APPLICABLE"]),
  requirementText: z.string().trim().min(20).max(1_200).optional(),
  note: z.string().trim().max(2_000).nullable().optional(),
});
export type DecideRegulatoryCandidate = z.infer<typeof decideRegulatoryCandidateSchema>;

/** Bulk counterpart of {@link decideRegulatoryCandidateSchema}: one reviewer action that records a
 *  decision for every pending candidate at once. Wording is never submitted here — a bulk approval
 *  accepts the requirement the analysis already extracted; editing stays a per-candidate action. */
export const decideRegulatoryCandidatesSchema = z.object({
  watchRevision: z.number().int().positive(),
  decisions: z
    .array(
      z.object({
        candidateId: idSchema,
        decision: z.enum(["APPLICABLE", "NOT_APPLICABLE"]),
      }),
    )
    .min(1)
    .max(1_000),
});
export type DecideRegulatoryCandidates = z.infer<typeof decideRegulatoryCandidatesSchema>;

export const publishRegulatoryBaselineSchema = z.object({
  analysisRunId: idSchema,
  watchRevision: z.number().int().positive(),
});
export type PublishRegulatoryBaseline = z.infer<typeof publishRegulatoryBaselineSchema>;

export const updateRegulatoryEvaluationSchema = z.object({
  revision: z.number().int().positive(),
  result: assessmentResultSchema,
  comment: z.string().trim().max(4_000).nullable().optional(),
});
export type UpdateRegulatoryEvaluation = z.infer<typeof updateRegulatoryEvaluationSchema>;

const regulatoryEvidenceFieldsSchema = z.object({
  kind: z.enum(["DOCUMENT", "PHOTO", "NOTE", "LINK"]),
  fileId: idSchema.nullable().optional(),
  label: z.string().trim().max(300).nullable().optional(),
  url: z.url().nullable().optional(),
  note: z.string().trim().max(4_000).nullable().optional(),
});

/** The payload a `kind` requires. Shared so the create schema can check a whole record and the
 *  service can check the merged record a partial update produces. */
export function regulatoryEvidencePayloadIssue(value: {
  kind: "DOCUMENT" | "PHOTO" | "NOTE" | "LINK";
  fileId?: string | null | undefined;
  url?: string | null | undefined;
  note?: string | null | undefined;
}): { path: "fileId" | "url" | "note"; message: string } | null {
  if ((value.kind === "DOCUMENT" || value.kind === "PHOTO") && !value.fileId)
    return { path: "fileId", message: "fileId is required" };
  if (value.kind === "LINK" && !value.url) return { path: "url", message: "url is required" };
  if (value.kind === "NOTE" && !value.note) return { path: "note", message: "note is required" };
  return null;
}

export const createRegulatoryEvidenceSchema = regulatoryEvidenceFieldsSchema.superRefine(
  (value, context) => {
    const issue = regulatoryEvidencePayloadIssue(value);
    if (issue) context.addIssue({ code: "custom", path: [issue.path], message: issue.message });
  },
);
export type CreateRegulatoryEvidence = z.infer<typeof createRegulatoryEvidenceSchema>;

/** Partial counterpart: `kind` may stay untouched, so the payload rule can only be enforced once
 *  the patch is merged with the stored row — see `regulatoryEvidencePayloadIssue`. */
export const updateRegulatoryEvidenceSchema = regulatoryEvidenceFieldsSchema.partial();
export type UpdateRegulatoryEvidence = z.infer<typeof updateRegulatoryEvidenceSchema>;

export const regulatoryActionStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "DONE", "VERIFIED"]);
export const regulatoryEffectivenessSchema = z.enum(["PENDING", "EFFECTIVE", "INEFFECTIVE"]);
export const createRegulatoryActionSchema = z.object({
  title: z.string().trim().min(2).max(500),
  assigneeId: idSchema.nullable().optional(),
  /** Free-text responsable, used when no platform user is assigned. The conformity pass proposes
   *  one and a reviewer can correct it; the register and the XLSX export both read
   *  `assignee?.name ?? responsibleName`. */
  responsibleName: z.string().trim().max(200).nullable().optional(),
  resources: z.string().trim().max(2_000).nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
  completedDate: z.iso.date().nullable().optional(),
  status: regulatoryActionStatusSchema.default("OPEN"),
  effectivenessCriteria: z.string().trim().max(2_000).nullable().optional(),
  effectiveness: regulatoryEffectivenessSchema.default("PENDING"),
  comment: z.string().trim().max(2_000).nullable().optional(),
});
/** `.partial()` alone keeps the `status` / `effectiveness` defaults, so a patch that only names,
 *  say, the responsable would silently reset a DONE + EFFECTIVE action to OPEN + PENDING. Both are
 *  re-declared without a default so an absent key really means "leave it alone". */
export const updateRegulatoryActionSchema = createRegulatoryActionSchema.partial().extend({
  status: regulatoryActionStatusSchema.optional(),
  effectiveness: regulatoryEffectivenessSchema.optional(),
});
export type CreateRegulatoryAction = z.infer<typeof createRegulatoryActionSchema>;
export type UpdateRegulatoryAction = z.infer<typeof updateRegulatoryActionSchema>;

export const regulatoryCitationSchema = normativeSearchResultSchema
  .pick({
    sourceId: true,
    documentId: true,
    revisionId: true,
    documentTitle: true,
    referenceNumber: true,
    revisionLabel: true,
    sourceEdition: true,
    jurisdiction: true,
    countryCode: true,
    language: true,
    documentFamily: true,
    provisionType: true,
    provisionIdentifier: true,
    headingPath: true,
    pageStart: true,
    pageEnd: true,
    excerpt: true,
    citationLabel: true,
  })
  .extend({
    type: regulatorySourceTypeSchema,
    url: z.string().url().nullable(),
    sourceId: idSchema.nullable(),
    documentId: idSchema.nullable(),
    revisionId: idSchema.nullable(),
    revisionLabel: z.string().nullable(),
    sourceEdition: z.string().nullable(),
    provisionType: z
      .enum(["clause", "article", "definition", "annex", "table", "note", "section"])
      .nullable(),
    excerpt: z.string().max(1_201).nullable(),
  });

export const regulatoryCandidateSchema = z.object({
  id: idSchema,
  changeType: regulatoryChangeTypeSchema,
  changeSummary: z.string().nullable(),
  previousEntryId: idSchema.nullable(),
  previousSource: regulatoryCitationSchema.nullable(),
  requiresReview: z.boolean(),
  suggestion: regulatoryApplicabilitySchema,
  decision: regulatoryApplicabilitySchema.nullable(),
  decisionSource: regulatoryDecisionSourceSchema.nullable(),
  rationale: z.string(),
  matchedProfileKeys: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  decisionNote: z.string().nullable(),
  reviewedAt: isoDateTimeSchema.nullable(),
  requirement: z.object({
    text: z.string().nullable(),
    status: regulatoryRequirementStatusSchema,
    supportingExcerpts: z.array(z.string()),
    issues: z.array(z.string()),
    source: regulatoryRequirementSourceSchema.nullable(),
    editedAt: isoDateTimeSchema.nullable(),
  }),
  source: regulatoryCitationSchema,
});

/**
 * Stable, machine-readable reasons a regulatory analysis run can fail. The
 * worker persists these on `RegulatoryAnalysisRun.errorCode` so operators and
 * the customer UI can tell an infrastructure gap apart from a corpus gap.
 */
export const regulatoryAnalysisErrorCodeSchema = z.enum([
  /** `NORMATIVE_RAG_ENABLED` is not `true` in the worker environment. */
  "NORMATIVE_RAG_DISABLED",
  /** Legacy error retained so historical runs remain readable. */
  "OPENAI_KEY_MISSING",
  /** The credential for the selected provider is unavailable. */
  "LLM_PROVIDER_MISSING",
  /** No embedding profile exists at all: the corpus was never indexed. */
  "EMBEDDING_PROFILE_MISSING",
  /** A profile exists but is still indexing; nothing is searchable yet. */
  "EMBEDDING_PROFILE_BUILDING",
  /** A profile finished indexing but was never activated by an admin. */
  "EMBEDDING_PROFILE_NOT_ACTIVATED",
  /** The active profile no longer covers every searchable revision. */
  "EMBEDDING_PROFILE_STALE",
  /** The corpus is searchable but nothing matched the project profile. */
  "CORPUS_COVERAGE_GAP",
  /** The run could not be enqueued. */
  "QUEUE_ERROR",
  /** The configured regulatory model is unavailable or rejected. */
  "REGULATORY_MODEL_UNAVAILABLE",
  /** An OpenAI rate limit persisted past every retry; transient, safe to retry. */
  "REGULATORY_MODEL_RATE_LIMITED",
  /** No worker is registered to consume regulatory analysis jobs. */
  "REGULATORY_WORKER_UNAVAILABLE",
  /** The configured per-run OpenAI budget was exhausted. */
  "REGULATORY_BUDGET_LIMIT",
  /** Anything else. */
  "ANALYSIS_FAILED",
]);
export type RegulatoryAnalysisErrorCode = z.infer<typeof regulatoryAnalysisErrorCodeSchema>;

/** Customer-facing French copy for each failure reason. */
export const regulatoryAnalysisErrorMessages: Record<RegulatoryAnalysisErrorCode, string> = {
  NORMATIVE_RAG_DISABLED:
    "La recherche normative est désactivée sur cette plateforme. Contactez votre administrateur.",
  OPENAI_KEY_MISSING: "Le service d’analyse n’est pas configuré. Contactez votre administrateur.",
  LLM_PROVIDER_MISSING: "Le service d’analyse n’est pas configuré. Contactez votre administrateur.",
  EMBEDDING_PROFILE_MISSING:
    "La base documentaire normative n’est pas encore indexée. Contactez votre administrateur.",
  EMBEDDING_PROFILE_BUILDING:
    "L’indexation de la base documentaire normative est en cours. Réessayez dans quelques minutes.",
  EMBEDDING_PROFILE_NOT_ACTIVATED:
    "L’index normatif est prêt mais n’a pas encore été activé. Contactez votre administrateur.",
  EMBEDDING_PROFILE_STALE:
    "De nouveaux textes normatifs attendent d’être indexés. Contactez votre administrateur.",
  CORPUS_COVERAGE_GAP:
    "Aucun texte normatif de la base ne correspond au profil du projet. Complétez le profil puis relancez l’analyse.",
  QUEUE_ERROR: "L’analyse n’a pas pu être mise en file d’attente. Relancez l’analyse.",
  REGULATORY_MODEL_UNAVAILABLE:
    "Le modèle d’analyse réglementaire configuré est indisponible. Contactez votre administrateur.",
  REGULATORY_MODEL_RATE_LIMITED:
    "Le modèle d’analyse est momentanément saturé. Relancez l’analyse dans quelques instants.",
  REGULATORY_WORKER_UNAVAILABLE:
    "Le service de veille réglementaire n’est pas disponible. Contactez votre administrateur.",
  REGULATORY_BUDGET_LIMIT:
    "La limite de coût de cette analyse a été atteinte. Les résultats terminés restent consultables.",
  ANALYSIS_FAILED: "Vous pouvez relancer l’analyse sans modifier le profil.",
};

/**
 * Error carrying a {@link RegulatoryAnalysisErrorCode} so the worker can record
 * a precise reason instead of a blanket `ANALYSIS_FAILED`.
 */
export class RegulatoryAnalysisError extends Error {
  constructor(
    readonly code: RegulatoryAnalysisErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "RegulatoryAnalysisError";
  }
}

export const lawSourceRequiredSchema = z.object({
  reference: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  reason: z.string().min(1).max(600),
  sourceUrl: z.string().url().max(2_048).nullish(),
});

export const regulatoryAnalysisRunSchema = z.object({
  id: idSchema,
  profileSnapshotId: idSchema,
  baseBaselineId: idSchema.nullable(),
  triggerType: regulatoryRunTriggerSchema,
  triggerDocumentVersionId: idSchema.nullable(),
  status: regulatoryAnalysisStatusSchema,
  asOf: z.iso.date(),
  languages: z.array(z.enum(["fr", "ar"])),
  phase: z.string(),
  progressPercent: z.number().int().min(0).max(100),
  coverage: z.object({
    completed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().nonnegative(),
    budgetUsd: z.number().positive(),
  }),
  clarificationRevision: z.number().int().nonnegative(),
  clarifications: z.array(
    z.object({ key: z.string(), question: z.string(), answer: z.unknown().nullable() }),
  ),
  sourceRequired: z.array(lawSourceRequiredSchema).optional(),
  review: z
    .object({
      outcome: regulatoryAnalysisReviewOutcomeSchema,
      rating: z.number().int().min(0).max(5).nullable(),
      comment: z.string().nullable(),
      createdAt: isoDateTimeSchema,
    })
    .nullable(),
  candidates: z.array(regulatoryCandidateSchema),
  diff: z.object({
    added: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    modified: z.number().int().nonnegative(),
    removalProposed: z.number().int().nonnegative(),
    requiresReview: z.number().int().nonnegative(),
  }),
  error: z.object({ code: z.string().nullable(), message: z.string().nullable() }).nullable(),
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});

export const regulatoryEvaluationSchema = z.object({
  id: idSchema,
  revision: z.number().int().positive(),
  result: assessmentResultSchema,
  comment: z.string().nullable(),
  evaluatedAt: isoDateTimeSchema.nullable(),
  requiresReevaluation: z.boolean(),
  aiAssessment: z.object({
    status: regulatoryAiEvaluationStatusSchema,
    suggestedResult: assessmentResultSchema.nullable(),
    rationale: z.string().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    matchedProfileKeys: z.array(z.string()),
    missingInformation: z.array(z.string()),
    remediationPlan: z.string().nullable(),
    action: z.object({
      title: z.string().nullable(),
      resources: z.string().nullable(),
      startDate: z.iso.date().nullable(),
      dueDate: z.iso.date().nullable(),
      responsible: z.string().nullable(),
      effectivenessCriteria: z.string().nullable(),
    }),
    evaluatedAt: isoDateTimeSchema.nullable(),
    errorMessage: z.string().nullable(),
    /** Last time the pass touched this row. Combined with `staleAiEvaluationMs` it separates a
     *  PENDING row a worker is still working towards from one left behind by a dead pass. */
    updatedAt: isoDateTimeSchema,
  }),
  evidence: z.array(
    z.object({
      id: idSchema,
      kind: z.enum(["DOCUMENT", "PHOTO", "NOTE", "LINK"]),
      fileId: idSchema.nullable(),
      label: z.string().nullable(),
      url: z.string().nullable(),
      note: z.string().nullable(),
      createdAt: isoDateTimeSchema,
    }),
  ),
  actions: z.array(
    z.object({
      id: idSchema,
      title: z.string(),
      assigneeId: idSchema.nullable(),
      /** The assigned member's name, or the free-text responsible the conformity pass proposed
       *  when no platform user has been assigned yet. */
      assigneeName: z.string().nullable(),
      resources: z.string().nullable(),
      dueDate: z.iso.date().nullable(),
      completedDate: z.iso.date().nullable(),
      status: regulatoryActionStatusSchema,
      effectivenessCriteria: z.string().nullable(),
      effectiveness: regulatoryEffectivenessSchema,
      comment: z.string().nullable(),
    }),
  ),
});

export const regulatoryRegisterEntrySchema = z.object({
  id: idSchema,
  previousEntryId: idSchema.nullable(),
  changeType: regulatoryChangeTypeSchema,
  orderIndex: z.number().int().nonnegative(),
  applicabilityRationale: z.string(),
  requirement: z
    .object({
      text: z.string(),
      source: regulatoryRequirementSourceSchema,
      supportingExcerpts: z.array(z.string()),
      reviewedAt: isoDateTimeSchema,
    })
    .nullable(),
  source: regulatoryCitationSchema,
  evaluation: regulatoryEvaluationSchema,
});

export const regulatoryWatchSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  status: regulatoryWatchStatusSchema,
  revision: z.number().int().positive(),
  currentAnalysis: regulatoryAnalysisRunSchema.nullable(),
  currentBaseline: z
    .object({
      id: idSchema,
      sequence: z.number().int().positive(),
      profileSnapshotId: idSchema,
      publishedAt: isoDateTimeSchema,
      entries: z.array(regulatoryRegisterEntrySchema),
    })
    .nullable(),
  synchronization: z.object({
    state: z.enum(["IDLE", "QUEUED", "RUNNING", "PARTIAL", "CHANGES_READY", "FAILED", "STALE"]),
    trigger: regulatoryRunTriggerSchema.nullable(),
    sourceBaselineId: idSchema.nullable(),
    progressPercent: z.number().int().min(0).max(100),
    lastCheckedAt: isoDateTimeSchema.nullable(),
    lastSuccessfulSyncAt: isoDateTimeSchema.nullable(),
  }),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type RegulatoryWatch = z.infer<typeof regulatoryWatchSchema>;
export type RegulatoryAnalysisRun = z.infer<typeof regulatoryAnalysisRunSchema>;
export const regulatoryAnalysisJobSchema = z.object({
  runId: idSchema.optional(),
  status: regulatoryAnalysisStatusSchema.optional(),
  jobId: z.string().min(1),
  queue: z.literal("regulatory-analysis"),
  correlationId: z.string().min(1),
});
export type RegulatoryAnalysisJob = z.infer<typeof regulatoryAnalysisJobSchema>;
export const regulatoryEvaluationJobSchema = z.object({
  jobId: z.string().min(1),
  queue: z.literal("regulatory-evaluation"),
  correlationId: z.string().min(1),
});
export type RegulatoryEvaluationJob = z.infer<typeof regulatoryEvaluationJobSchema>;

export const correctiveActionSchema = tenantEntitySchema.extend({
  findingId: idSchema,
  title: z.string().min(2).max(200),
  assigneeId: idSchema.nullable(),
  dueAt: isoDateTimeSchema,
  status: z.enum(["OPEN", "IN_PROGRESS", "BLOCKED", "DONE", "VERIFIED"]),
});
export const createCorrectiveActionSchema = correctiveActionSchema.pick({
  findingId: true,
  title: true,
  assigneeId: true,
  dueAt: true,
});
export type CorrectiveAction = z.infer<typeof correctiveActionSchema>;
export type CreateCorrectiveAction = z.infer<typeof createCorrectiveActionSchema>;

export const paginatedSitesSchema = z.object({
  data: z.array(siteSchema),
  meta: paginationMetaSchema,
});

export const jobEnvelopeSchema = z.object({
  organizationId: idSchema,
  correlationId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});
export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;

export const workQueueNames = {
  documentIngestion: "document-ingestion",
  embeddingGeneration: "embedding-generation",
  knowledgeEmbedding: "knowledge-embedding",
  regulatoryAnalysis: "regulatory-analysis",
  regulatoryImpact: "regulatory-impact",
  regulatoryEvaluation: "regulatory-evaluation",
  contextExternalResearch: "context-external-research",
  contextAnalysis: "context-analysis",
  evidenceAnalysis: "evidence-analysis",
  reportGeneration: "report-generation",
  notifications: "notifications",
} as const;
export type WorkQueueName = (typeof workQueueNames)[keyof typeof workQueueNames];

export const emailTypes = [
  "ORGANIZATION_INVITATION",
  "REGULATORY_CLARIFICATION_REQUIRED",
  "REGULATORY_REVIEW_READY",
  "REGULATORY_IMPACT",
  "REGULATORY_ANALYSIS_FAILED",
  "REGULATORY_ACTION_DUE_SOON",
  "REGULATORY_ACTION_OVERDUE",
] as const;
export const emailTypeSchema = z.enum(emailTypes);
export type EmailType = z.infer<typeof emailTypeSchema>;

export const emailDeliveryStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "SENT",
  "FAILED",
  "CANCELLED",
]);
export type EmailDeliveryStatus = z.infer<typeof emailDeliveryStatusSchema>;

export const emailTemplateSettingSchema = z.object({
  templateId: z.number().int().positive().nullable(),
  requiredParameters: z.array(z.string()),
  example: z.record(z.string(), z.union([z.string(), z.number()])),
  metadata: z
    .object({
      name: z.string(),
      subject: z.string(),
      active: z.boolean(),
      validatedAt: isoDateTimeSchema,
    })
    .nullable(),
});
export type EmailTemplateSetting = z.infer<typeof emailTemplateSettingSchema>;

export const emailSettingsViewSchema = z.object({
  provider: z.literal("brevo"),
  credential: z.object({
    configured: z.boolean(),
    source: z.enum(["database", "environment", "none"]),
    preview: z.string().nullable(),
  }),
  templates: z.record(emailTypeSchema, emailTemplateSettingSchema),
  updatedAt: isoDateTimeSchema.nullable(),
  updatedBy: z.object({ id: idSchema, name: z.string() }).nullable(),
});
export type EmailSettingsView = z.infer<typeof emailSettingsViewSchema>;

export const updateEmailSettingsSchema = z
  .object({
    apiKey: z.string().trim().max(400).nullable().optional(),
    templates: z.partialRecord(emailTypeSchema, z.number().int().positive().nullable()).optional(),
  })
  .refine((value) => value.apiKey !== undefined || value.templates !== undefined, {
    message: "At least one email setting is required",
  });
export type UpdateEmailSettings = z.infer<typeof updateEmailSettingsSchema>;

export const organizationRoleSchema = z.enum(["owner", "admin", "member"]);
export type OrganizationRoleContract = z.infer<typeof organizationRoleSchema>;
export const membershipStatusSchema = z.enum(["active", "suspended"]);
export type MembershipStatusContract = z.infer<typeof membershipStatusSchema>;
export const organizationMembershipMutationSchema = z.enum([
  "invite",
  "change_role",
  "suspend",
  "reactivate",
  "remove",
  "cancel_invitation",
  "resend_invitation",
]);
export type OrganizationMembershipMutation = z.infer<typeof organizationMembershipMutationSchema>;
export const activeMembershipSchema = z.object({
  organizationId: idSchema,
  role: organizationRoleSchema,
  status: membershipStatusSchema,
});
export type ActiveMembership = z.infer<typeof activeMembershipSchema>;
export const allowedOrganizationMutationsSchema = z.object({
  mutations: z.array(organizationMembershipMutationSchema),
  inviteRoles: z.array(organizationRoleSchema),
  manageableRoles: z.array(organizationRoleSchema),
});
export type AllowedOrganizationMutations = z.infer<typeof allowedOrganizationMutationsSchema>;

export const organizationMemberSummarySchema = z.object({
  id: idSchema,
  userId: idSchema,
  name: z.string(),
  email: z.email(),
  role: organizationRoleSchema,
  status: membershipStatusSchema,
  createdAt: isoDateTimeSchema,
});
export type OrganizationMemberSummary = z.infer<typeof organizationMemberSummarySchema>;

export const organizationInvitationSummarySchema = z.object({
  id: idSchema,
  email: z.email(),
  role: organizationRoleSchema,
  status: z.string(),
  expiresAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  deliveryStatus: emailDeliveryStatusSchema.nullable(),
  deliveryError: z.string().nullable(),
  lastSentAt: isoDateTimeSchema.nullable(),
});
export type OrganizationInvitationSummary = z.infer<typeof organizationInvitationSummarySchema>;

export const organizationTeamSchema = z.object({
  currentMember: organizationMemberSummarySchema,
  members: z.array(organizationMemberSummarySchema),
  invitations: z.array(organizationInvitationSummarySchema),
});
export type OrganizationTeam = z.infer<typeof organizationTeamSchema>;

export const invitationPreviewSchema = z.object({
  id: idSchema,
  organizationName: z.string(),
  inviterName: z.string(),
  recipientEmailMasked: z.string(),
  role: organizationRoleSchema,
  status: z.enum(["pending", "accepted", "rejected", "canceled", "expired"]),
  expiresAt: isoDateTimeSchema,
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

export const updateMembershipStatusSchema = z.object({ status: membershipStatusSchema });
export type UpdateMembershipStatus = z.infer<typeof updateMembershipStatusSchema>;

export const complianceResultSchema = z.object({
  score: z.number().min(0).max(100),
  applicableCount: z.number().int().nonnegative(),
  conformingCount: z.number().int().nonnegative(),
  explanation: z.string().max(4_000),
  citations: z.array(idSchema),
  humanReviewRequired: z.boolean(),
});
export type ComplianceResult = z.infer<typeof complianceResultSchema>;

// ---------------------------------------------------------------------------
// SMQ — Analyse des enjeux (ISO 9001 §4.1)
// ---------------------------------------------------------------------------

export const contextAnalysisMethodSchema = z.enum(["SWOT", "PESTEL"]);
export type ContextAnalysisMethod = z.infer<typeof contextAnalysisMethodSchema>;

export const contextRunStatusSchema = z.enum(["DRAFT", "RUNNING", "COMPLETED", "FAILED"]);
export type ContextRunStatus = z.infer<typeof contextRunStatusSchema>;

export const contextIssueOriginSchema = z.enum(["INTERNAL", "EXTERNAL"]);
export type ContextIssueOrigin = z.infer<typeof contextIssueOriginSchema>;

export const contextIssueReviewStatusSchema = z.enum([
  "PENDING",
  "VALIDATED",
  "MODIFIED",
  "NOT_RETAINED",
]);
export type ContextIssueReviewStatus = z.infer<typeof contextIssueReviewStatusSchema>;

export const contextIssueSourceKindSchema = z.enum(["AI", "MANUAL"]);
export type ContextIssueSourceKind = z.infer<typeof contextIssueSourceKindSchema>;

export const contextIssueNatureSchema = z.enum(["force", "faiblesse", "opportunite", "menace"]);
export type ContextIssueNature = z.infer<typeof contextIssueNatureSchema>;

export const projectContextSettingsSchema = z.object({
  projectId: idSchema,
  analysisMethod: contextAnalysisMethodSchema,
  explicit: z.boolean(),
});
export type ProjectContextSettings = z.infer<typeof projectContextSettingsSchema>;

export const setContextAnalysisMethodSchema = z.object({
  method: contextAnalysisMethodSchema,
});
export type SetContextAnalysisMethod = z.infer<typeof setContextAnalysisMethodSchema>;

/* ------------------------------- Step 1 ------------------------------- */

export const contextInternalInputSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  sectionKey: z.string().min(1).max(80),
  questionKey: z.string().min(1).max(120),
  questionLabel: z.string().min(1).max(400),
  answerText: z.string().max(8_000),
  status: z.string(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type ContextInternalInput = z.infer<typeof contextInternalInputSchema>;

export const upsertContextInternalInputSchema = z.object({
  sectionKey: z.string().min(1).max(80),
  questionKey: z.string().min(1).max(120),
  questionLabel: z.string().min(1).max(400),
  answerText: z.string().max(8_000),
  status: z.enum(["draft", "answered"]).default("draft"),
});
export type UpsertContextInternalInput = z.infer<typeof upsertContextInternalInputSchema>;

/* ------------------------------- Step 2 ------------------------------- */

export const contextExternalFactorSourceSchema = z.object({
  id: idSchema,
  url: z.string().nullable(),
  title: z.string().nullable(),
  publisher: z.string().nullable(),
  sourceDate: z.string().nullable(),
  groundingOrigin: z.string(),
  excerpt: z.string().nullable(),
  authorityTier: z.string().nullable(),
});
export type ContextExternalFactorSource = z.infer<typeof contextExternalFactorSourceSchema>;

export const contextExternalFactorSchema = z.object({
  id: idSchema,
  runId: idSchema,
  categoryKey: z.string(),
  categoryLabel: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  relevanceToCompany: z.string().nullable(),
  influenceOnObjectives: z.string().nullable(),
  influenceOnQuality: z.string().nullable(),
  influenceOnCustomerSatisfaction: z.string().nullable(),
  geographicScope: z.string().nullable(),
  orientation: z.string().nullable(),
  evidenceStrength: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  sourceOrigin: z.string(),
  regulatoryEntryId: idSchema.nullable(),
  canonicalKey: z.string(),
  comparisonStatus: z.string().nullable(),
  model: z.string().nullable(),
  generatedAt: isoDateTimeSchema,
  sources: z.array(contextExternalFactorSourceSchema),
});
export type ContextExternalFactor = z.infer<typeof contextExternalFactorSchema>;

export const contextExternalRunSummarySchema = z.object({
  id: idSchema,
  status: contextRunStatusSchema,
  createdAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  errorMessage: z.string().nullable(),
  model: z.string().nullable(),
  factorsCount: z.number().int().nonnegative(),
  sourcesCount: z.number().int().nonnegative(),
  searchQueries: z.array(z.string()),
  regulatoryRunId: idSchema.nullable(),
  analysisMethod: contextAnalysisMethodSchema.nullable(),
});
export type ContextExternalRunSummary = z.infer<typeof contextExternalRunSummarySchema>;

export const contextExternalRunResultSchema = z.object({
  runId: idSchema,
  status: z.enum(["completed", "failed"]),
  message: z.string().nullable(),
  factorsCreated: z.number().int().nonnegative(),
  sourcesCreated: z.number().int().nonnegative(),
  categoriesCovered: z.array(z.string()),
  reusedRegulatoryEntries: z.number().int().nonnegative(),
});
export type ContextExternalRunResult = z.infer<typeof contextExternalRunResultSchema>;

/* ------------------------------ Step 3/4 ------------------------------- */

export const contextIssueEvidenceSchema = z.object({
  id: idSchema,
  sourceType: z.string(),
  originKind: z.enum(["SYSTEM", "USER"]),
  sourceUrl: z.string().nullable(),
  excerpt: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type ContextIssueEvidence = z.infer<typeof contextIssueEvidenceSchema>;

export const contextIssueCorrectionSchema = z.object({
  id: idSchema,
  fieldName: z.string(),
  previousValue: z.unknown(),
  newValue: z.unknown(),
  correctionReason: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type ContextIssueCorrection = z.infer<typeof contextIssueCorrectionSchema>;

export const contextIssueScoresSchema = z.object({
  influenceObjectives: z.number().min(0).max(5).optional(),
  influenceQuality: z.number().min(0).max(5).optional(),
  influenceCustomer: z.number().min(0).max(5).optional(),
  overall: z.number().min(0).max(5).optional(),
});
export type ContextIssueScores = z.infer<typeof contextIssueScoresSchema>;

export const contextIssueSchema = z.object({
  id: idSchema,
  runId: idSchema,
  canonicalKey: z.string(),
  comparisonStatus: z.string().nullable(),

  aiOrigin: contextIssueOriginSchema,
  aiCategoryKey: z.string().nullable(),
  aiCategoryLabel: z.string().nullable(),
  aiTitle: z.string(),
  aiDescription: z.string().nullable(),
  aiReasoning: z.string().nullable(),
  aiNature: z.string().nullable(),
  aiImpactQuality: z.string().nullable(),
  aiImpactCustomerSatisfaction: z.string().nullable(),
  aiImpactOverall: z.string().nullable(),
  aiScores: contextIssueScoresSchema,
  aiConfidence: z.number().min(0).max(1).nullable(),
  aiRecommendedPriority: z.boolean(),
  aiModel: z.string().nullable(),
  aiGeneratedAt: isoDateTimeSchema,

  origin: contextIssueOriginSchema,
  categoryKey: z.string().nullable(),
  categoryLabel: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  nature: z.string().nullable(),
  impactQuality: z.string().nullable(),
  impactCustomerSatisfaction: z.string().nullable(),
  impactOverall: z.string().nullable(),
  scores: contextIssueScoresSchema,
  selectedPriority: z.boolean(),

  reviewStatus: contextIssueReviewStatusSchema,
  humanOverride: z.boolean(),
  humanReviewedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,

  sourceKind: contextIssueSourceKindSchema,
  createdAt: isoDateTimeSchema,

  evidence: z.array(contextIssueEvidenceSchema),
  corrections: z.array(contextIssueCorrectionSchema),
});
export type ContextIssue = z.infer<typeof contextIssueSchema>;

export const contextAnalysisRunSummarySchema = z.object({
  id: idSchema,
  status: contextRunStatusSchema,
  createdAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  errorMessage: z.string().nullable(),
  issuesCount: z.number().int().nonnegative(),
  internalCount: z.number().int().nonnegative(),
  externalCount: z.number().int().nonnegative(),
  model: z.string().nullable(),
  methodologyVersion: z.string().nullable(),
  analysisMethod: contextAnalysisMethodSchema.nullable(),
});
export type ContextAnalysisRunSummary = z.infer<typeof contextAnalysisRunSummarySchema>;

export const contextSynthesisRunResultSchema = z.object({
  runId: idSchema,
  status: z.enum(["completed", "failed"]),
  message: z.string().nullable(),
  issuesCreated: z.number().int().nonnegative(),
  internalCount: z.number().int().nonnegative(),
  externalCount: z.number().int().nonnegative(),
  evidenceCreated: z.number().int().nonnegative(),
});
export type ContextSynthesisRunResult = z.infer<typeof contextSynthesisRunResultSchema>;

/** Mirrors apply_context_issue_override: every field optional, only supplied
 * fields that materially differ from the current effective value produce a
 * ContextIssueCorrection row. */
export const applyContextIssueOverrideSchema = z.object({
  origin: contextIssueOriginSchema.optional(),
  categoryKey: z.string().min(1).max(80).optional(),
  categoryLabel: z.string().min(1).max(160).optional(),
  title: z.string().min(1).max(240).optional(),
  description: z.string().min(1).max(4_000).optional(),
  nature: contextIssueNatureSchema.optional(),
  impactQuality: z.string().min(1).max(2_000).optional(),
  impactCustomerSatisfaction: z.string().min(1).max(2_000).optional(),
  impactOverall: z.string().min(1).max(2_000).optional(),
  scores: contextIssueScoresSchema.optional(),
  selectedPriority: z.boolean().optional(),
  reviewStatus: contextIssueReviewStatusSchema.optional(),
  correctionReason: z.string().max(2_000).optional(),
});
export type ApplyContextIssueOverride = z.infer<typeof applyContextIssueOverrideSchema>;

/** Mirrors create_manual_context_issue: internal issues must be
 * force/faiblesse, external issues must be opportunite/menace. */
export const createManualContextIssueSchema = z
  .object({
    origin: contextIssueOriginSchema,
    nature: contextIssueNatureSchema,
    title: z.string().min(1).max(240),
    description: z.string().min(1).max(4_000),
    categoryKey: z.string().min(1).max(80).default("ajout_manuel"),
    categoryLabel: z.string().min(1).max(160).default("Ajout manuel"),
    reason: z.string().max(2_000).optional(),
  })
  .refine(
    (input) =>
      input.origin === "INTERNAL"
        ? input.nature === "force" || input.nature === "faiblesse"
        : input.nature === "opportunite" || input.nature === "menace",
    {
      message: "internal issues must be force or faiblesse; external must be opportunite or menace",
    },
  );
export type CreateManualContextIssue = z.infer<typeof createManualContextIssueSchema>;

export const addContextIssueEvidenceSchema = z.object({
  excerpt: z.string().max(2_000).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type AddContextIssueEvidence = z.infer<typeof addContextIssueEvidenceSchema>;
