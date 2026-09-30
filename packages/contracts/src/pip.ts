import { z } from "zod";

export const pipStageSchema = z.enum(["INVENTORY", "REQUIREMENTS", "EVALUATION"]);
export const pipReviewStatusSchema = z.enum(["PENDING", "VALIDATED", "MODIFIED", "NOT_RETAINED"]);
export const pipMethodSchema = z.enum(["power_interest", "criticality", "both"]);
const text = z.string().trim().min(1).max(4000);
export const pipEvidenceSchema = z.object({
  sourceType: z.enum([
    "profile",
    "internal_context",
    "context_analysis",
    "regulatory",
    "ai_sector_knowledge",
    "user_input",
  ]),
  reference: z.string().max(300).nullable(),
  excerpt: text,
});
export const pipPartyContentSchema = z.object({
  name: z.string().trim().min(2).max(300),
  description: text,
  category: z.string().trim().min(1).max(160),
  scope: z.enum(["internal", "external"]),
  relevance: z.enum([
    "relevant",
    "potentially_relevant",
    "insufficient_information",
    "not_relevant",
  ]),
  reasoning: text,
  confidence: z.number().min(0).max(1).nullable(),
  evidence: z.array(pipEvidenceSchema).max(20),
});
export const pipRequirementContentSchema = z.object({
  kind: z.enum(["need", "qms_requirement", "operational_disposition"]),
  text,
  reasoning: text,
  sourceType: z.enum([
    "normative",
    "legal_regulatory",
    "contractual",
    "customer",
    "organizational",
    "stakeholder_expectation",
    "ai_recommendation",
  ]),
  regulatoryEntryId: z.string().nullable(),
  sourceLabel: z.string().max(1000).nullable(),
  sourceUrl: z.string().url().nullable(),
});
export const pipEvaluationContentSchema = z.object({
  power: z.number().int().min(1).max(5).nullable(),
  interest: z.number().int().min(1).max(5).nullable(),
  impact: z.number().int().min(1).max(3).nullable(),
  requirementLevel: z.number().int().min(1).max(3).nullable(),
  monitoringMethod: z.string().trim().max(1000),
  monitoringFrequency: z.string().trim().max(300),
  reasoning: text,
});
export const pipRequirementSchema = z.object({
  id: z.string(),
  origin: z.enum(["ai", "user"]),
  content: pipRequirementContentSchema,
  aiProposal: pipRequirementContentSchema.nullable(),
  reviewStatus: pipReviewStatusSchema,
  services: z.array(z.string()),
  allocationReviewed: z.boolean(),
  noServiceConfirmed: z.boolean(),
});
export const pipEvaluationSchema = z.object({
  id: z.string(),
  content: pipEvaluationContentSchema,
  aiProposal: pipEvaluationContentSchema.nullable(),
  reviewStatus: pipReviewStatusSchema,
  methodologyVersion: z.string(),
  strategyVersion: z.string(),
});
export const pipPartySchema = z.object({
  id: z.string(),
  origin: z.enum(["ai", "user"]),
  content: pipPartyContentSchema,
  aiProposal: pipPartyContentSchema.nullable(),
  reviewStatus: pipReviewStatusSchema,
  requirements: z.array(pipRequirementSchema),
  evaluation: pipEvaluationSchema.nullable(),
});
export const pipRunSchema = z.object({
  id: z.string(),
  stage: pipStageSchema,
  status: z.enum(["DRAFT", "RUNNING", "COMPLETED", "FAILED"]),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  methodologyVersion: z.string(),
  model: z.string().nullable(),
});
export const pipRegisterSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  organizationName: z.string(),
  standard: z.string(),
  language: z.enum(["fr", "en", "ar"]),
  evaluationMethod: pipMethodSchema,
  revision: z.number().int(),
  outdated: z.boolean(),
  validatedAt: z.string().nullable(),
  parties: z.array(pipPartySchema),
  runs: z.array(pipRunSchema),
  clarifications: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      rationale: z.string(),
      answer: z.string().nullable(),
    }),
  ),
});
export const pipLaunchSchema = z.object({
  stage: pipStageSchema,
  method: pipMethodSchema.default("both"),
});
export const pipJobSchema = z.object({ runId: z.string() });
const pipReviewFields = {
  entityId: z.string().min(1),
  reviewStatus: pipReviewStatusSchema,
  reason: z.string().trim().min(5).max(2000),
};
export const pipReviewSchema = z.discriminatedUnion("entityType", [
  z.object({
    ...pipReviewFields,
    entityType: z.literal("party"),
    content: pipPartyContentSchema.optional(),
  }),
  z.object({
    ...pipReviewFields,
    entityType: z.literal("requirement"),
    content: pipRequirementContentSchema.optional(),
  }),
  z.object({
    ...pipReviewFields,
    entityType: z.literal("evaluation"),
    content: pipEvaluationContentSchema.optional(),
  }),
]);
export const pipAddPartySchema = pipPartyContentSchema.omit({ confidence: true, evidence: true });
export const pipAddRequirementSchema = z.object({
  partyId: z.string(),
  content: pipRequirementContentSchema,
});
export const pipAllocationSchema = z
  .object({
    requirementId: z.string(),
    services: z.array(z.string().trim().min(1).max(160)).max(20),
    noServiceConfirmed: z.boolean(),
    reason: z.string().trim().min(5).max(2000),
  })
  .refine(
    (value) => (value.noServiceConfirmed ? value.services.length === 0 : value.services.length > 0),
    { message: "Choose services or explicitly confirm none" },
  );
export const pipAnswerSchema = z.object({ id: z.string(), answer: text });
export type PipParty = z.infer<typeof pipPartySchema>;
export type PipRequirement = z.infer<typeof pipRequirementSchema>;
export type PipEvaluation = z.infer<typeof pipEvaluationSchema>;
export type PipRegister = z.infer<typeof pipRegisterSchema>;
export type PipReview = z.infer<typeof pipReviewSchema>;
export type PipLaunch = z.infer<typeof pipLaunchSchema>;
export type PipAllocation = z.infer<typeof pipAllocationSchema>;
export type PipAddParty = z.infer<typeof pipAddPartySchema>;
export type PipAddRequirement = z.infer<typeof pipAddRequirementSchema>;
export type PipAnswer = z.infer<typeof pipAnswerSchema>;

/** The worker reads this immutable input, never another tenant's live records. */
export const pipMaterialSchema = z.object({
  language: z.enum(["fr", "en", "ar"]),
  digest: z.string(),
  issues: z.array(
    z.object({ id: z.string(), title: z.string(), description: z.string().nullable() }),
  ),
  regulations: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      requirementText: z.string().nullable(),
      sourceUrl: z.string().nullable(),
    }),
  ),
  clarifications: z.array(z.object({ question: z.string(), answer: z.string() })),
  method: pipMethodSchema,
  parties: z.array(pipPartySchema),
});
export type PipMaterial = z.infer<typeof pipMaterialSchema>;
export const pipInventoryOutputSchema = z.object({
  parties: z
    .array(pipPartyContentSchema.extend({ evidence: z.array(pipEvidenceSchema).min(1).max(20) }))
    .min(1)
    .max(40),
  clarifications: z.array(z.object({ question: text, rationale: text })).max(3),
});
export const pipRequirementsOutputSchema = z.object({
  parties: z
    .array(
      z.object({
        partyId: z.string(),
        items: z
          .array(
            pipRequirementContentSchema.extend({
              services: z.array(z.string().trim().min(1).max(160)).max(10),
            }),
          )
          .min(1)
          .max(30),
      }),
    )
    .min(1)
    .max(40),
});
export const pipEvaluationOutputSchema = z.object({
  evaluations: z
    .array(z.object({ partyId: z.string(), content: pipEvaluationContentSchema }))
    .min(1)
    .max(40),
});
