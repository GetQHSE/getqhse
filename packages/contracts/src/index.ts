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
  requirementId: idSchema.nullable(),
  fileId: idSchema.nullable(),
  kind: z.enum(["DOCUMENT", "PHOTO", "NOTE", "LINK"]),
  summary: z.string().max(2_000).nullable(),
});
export const createEvidenceSchema = evidenceSchema.pick({
  auditId: true,
  requirementId: true,
  fileId: true,
  kind: true,
  summary: true,
});
export type Evidence = z.infer<typeof evidenceSchema>;
export type CreateEvidence = z.infer<typeof createEvidenceSchema>;

export const findingSeveritySchema = z.enum(["OBSERVATION", "MINOR", "MAJOR", "CRITICAL"]);
export const findingSchema = tenantEntitySchema.extend({
  auditId: idSchema,
  requirementId: idSchema.nullable(),
  title: z.string().min(2).max(200),
  description: z.string().min(1).max(10_000),
  severity: findingSeveritySchema,
  status: z.enum(["OPEN", "IN_PROGRESS", "VERIFIED", "CLOSED"]),
});
export const createFindingSchema = findingSchema.pick({
  auditId: true,
  requirementId: true,
  title: true,
  description: true,
  severity: true,
});
export type Finding = z.infer<typeof findingSchema>;
export type CreateFinding = z.infer<typeof createFindingSchema>;

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
  evidenceAnalysis: "evidence-analysis",
  reportGeneration: "report-generation",
  notifications: "notifications",
} as const;
export type WorkQueueName = (typeof workQueueNames)[keyof typeof workQueueNames];

export const complianceResultSchema = z.object({
  score: z.number().min(0).max(100),
  applicableCount: z.number().int().nonnegative(),
  conformingCount: z.number().int().nonnegative(),
  explanation: z.string().max(4_000),
  citations: z.array(idSchema),
  humanReviewRequired: z.boolean(),
});
export type ComplianceResult = z.infer<typeof complianceResultSchema>;
