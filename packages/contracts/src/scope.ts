import { z } from "zod";
const supportedLanguageSchema = z.enum(["fr", "en", "ar"]);
const short = z.string().trim().max(300);
const text = z.string().trim().max(4000);
export const scopeDeclarationSchema = z.object({
  activitiesInclusion: z.enum(["all", "exclude_some"]).nullable(),
  activities: text,
  excludedActivities: text,
  activitiesReason: text,
  sitesCoverage: z.enum(["all", "specific"]).nullable(),
  sites: z
    .array(z.object({ name: short, type: short, address: z.string().trim().max(1000) }))
    .max(50),
  productsInclusion: z.enum(["all", "exclude_some"]).nullable(),
  products: text,
  excludedProducts: text,
  productsReason: text,
  designDeclaration: z.enum(["designs_own", "customer_specifications"]).nullable(),
  designDetails: text,
  thirdPartyProperty: z.enum(["yes", "no"]).nullable(),
  thirdPartyPropertyDetails: text,
  notes: text,
});
export const scopeVerificationInputSchema = z.object({
  applicability: z.enum(["applicable", "not_applicable"]),
  justification: z.string().trim().min(20).max(2000),
  acknowledgedFindings: z.array(z.string()).max(100),
});
export const scopeStatementContentSchema = z.object({
  statement: z.string().trim().min(80).max(1500),
  nonApplicable: z
    .array(
      z.object({ clause: z.literal("8.3"), justification: z.string().trim().min(20).max(2000) }),
    )
    .max(1),
});
export const scopeFactsSchema = z.object({
  organizationName: z.string(),
  projectName: z.string(),
  standard: z.string(),
  language: supportedLanguageSchema,
  projectActivities: z.array(z.string()),
  profile: z.array(z.object({ key: z.string(), value: z.string() })),
  issues: z.array(z.object({ id: z.string(), title: z.string() })),
  parties: z.array(z.object({ id: z.string(), name: z.string() })),
  requirements: z.array(z.object({ id: z.string(), partyName: z.string(), text: z.string() })),
  risks: z.array(z.object({ id: z.string(), title: z.string() })),
});
export const scopeVerificationSchema = scopeVerificationInputSchema.extend({
  id: z.string(),
  fingerprint: z.string(),
  authorId: z.string(),
  reviewedAt: z.string(),
});
export const scopeStatementSchema = scopeStatementContentSchema.extend({
  id: z.string(),
  status: z.enum(["DRAFT", "VALIDATED"]),
  version: z.number().int().nullable(),
  fingerprint: z.string(),
  verificationId: z.string(),
  model: z.string().nullable(),
  generatedAt: z.string().nullable(),
  validatedAt: z.string().nullable(),
  validatedById: z.string().nullable(),
  professionallyModified: z.boolean(),
  updatedAt: z.string(),
  sourceSnapshot: z.object({
    facts: scopeFactsSchema,
    declaration: scopeDeclarationSchema,
    verification: scopeVerificationInputSchema,
  }),
});
export const scopeMaterialSchema = z.object({
  facts: scopeFactsSchema,
  declaration: scopeDeclarationSchema,
  verification: scopeVerificationSchema,
  fingerprint: z.string(),
});
export const scopeRegisterSchema = z.object({
  projectId: z.string(),
  revision: z.number().int(),
  facts: scopeFactsSchema,
  declaration: scopeDeclarationSchema,
  fingerprint: z.string(),
  verification: scopeVerificationSchema.nullable(),
  verificationCurrent: z.boolean(),
  statements: z.array(scopeStatementSchema),
  runs: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      error: z.string().nullable(),
      model: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export const scopeWriteSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("declaration"),
    revision: z.number().int().min(0),
    declaration: scopeDeclarationSchema,
  }),
  z.object({
    kind: z.literal("verification"),
    revision: z.number().int().min(0),
    fingerprint: z.string(),
    verification: scopeVerificationInputSchema,
  }),
  z.object({
    kind: z.literal("statement"),
    revision: z.number().int().min(0),
    statementId: z.string(),
    statement: z.string().trim().min(80).max(1500),
  }),
  z.object({
    kind: z.literal("validate"),
    revision: z.number().int().min(0),
    statementId: z.string(),
  }),
]);
export const scopeLaunchSchema = z.object({
  revision: z.number().int().min(0),
  fingerprint: z.string(),
});
export type ScopeDeclaration = z.infer<typeof scopeDeclarationSchema>;
export type ScopeFacts = z.infer<typeof scopeFactsSchema>;
export type ScopeVerificationInput = z.infer<typeof scopeVerificationInputSchema>;
export type ScopeStatementContent = z.infer<typeof scopeStatementContentSchema>;
export type ScopeMaterial = z.infer<typeof scopeMaterialSchema>;
export type ScopeWrite = z.infer<typeof scopeWriteSchema>;
export type ScopeRegister = z.infer<typeof scopeRegisterSchema>;
export type ScopeStatement = z.infer<typeof scopeStatementSchema>;
export type ScopeLaunch = z.infer<typeof scopeLaunchSchema>;
