import { z } from "zod";
import { pipReviewStatusSchema } from "./pip.js";
const text = z.string().trim().min(1).max(4000);
const short = z.string().trim().min(1).max(300);
const date = z.iso.date();
export const roBranchSchema = z.enum(["context_issue", "pip_requirement"]);
export const roRatingSchema = z.object({
  probability: z.number().int().min(1).max(5).nullable(),
  impact: z.number().int().min(1).max(5).nullable(),
  feasibility: z.number().int().min(1).max(5).nullable(),
  benefit: z.number().int().min(1).max(5).nullable(),
  priority: z.enum(["P1", "P2", "P3", "P4"]),
  reasoning: text,
});
export const roContentSchema = z.object({
  type: z.enum(["risk", "opportunity"]),
  title: short,
  description: text,
  causes: z.string().max(4000),
  consequences: z.string().max(4000),
  reasoning: text,
  confidence: z.number().min(0).max(1).nullable(),
});
export const roSourceSchema = z.object({
  id: z.string(),
  branch: roBranchSchema,
  title: short,
  description: z.string(),
  partyId: z.string().nullable(),
  partyName: z.string().nullable(),
  kind: z.string().nullable(),
  fingerprint: z.string(),
});
export const roEffectiveSchema = z.object({
  content: roContentSchema,
  rating: roRatingSchema.nullable(),
  ratingReviewed: z.boolean(),
  controlsState: z.enum(["undeclared", "existing", "none"]),
  controls: z.array(text).max(30),
  controlsReviewed: z.boolean(),
});
export const roActionContentSchema = z
  .object({
    title: short,
    description: z.string().max(4000),
    process: short,
    owner: short,
    objective: z.string().max(1000),
    resources: z.string().max(1000),
    budget: z.string().max(300),
    plannedDate: date,
    criterion: text,
    effectivenessDate: date,
  })
  .refine((v) => v.effectivenessDate >= v.plannedDate, {
    message: "Effectiveness date must follow planned date",
  });
export const roProgressSchema = z
  .object({
    status: z.enum(["todo", "in_progress", "completed", "cancelled"]),
    percent: z.number().int().min(0).max(100),
    actualDate: date.nullable(),
    comment: text,
  })
  .refine((v) => v.status !== "completed" || (v.percent === 100 && v.actualDate !== null), {
    message: "Completed action requires date and 100% progress",
  });
export const roEffectivenessSchema = z.object({
  date,
  result: z.enum(["effective", "partially_effective", "ineffective"]),
  measuredValue: text,
  comment: text,
});
export const roActionSchema = z.object({
  id: z.string(),
  origin: z.enum(["ai", "user"]),
  content: roActionContentSchema,
  aiProposal: roActionContentSchema.nullable(),
  reviewStatus: pipReviewStatusSchema,
  progress: roProgressSchema.nullable(),
  effectiveness: z.array(roEffectivenessSchema),
});
export const roItemSchema = z.object({
  id: z.string(),
  origin: z.enum(["ai", "user"]),
  source: roSourceSchema.nullable(),
  aiProposal: roEffectiveSchema.nullable(),
  effective: roEffectiveSchema,
  reviewStatus: pipReviewStatusSchema,
  actions: z.array(roActionSchema),
});
export const roLaunchSchema = z.discriminatedUnion("stage", [
  z.object({ stage: z.literal("GENERATION"), branch: roBranchSchema }),
  z.object({ stage: z.literal("TREATMENT") }),
]);
const review = { entityId: z.string().min(1), reason: text };
export const roWriteSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("item"),
    ...review,
    reviewStatus: pipReviewStatusSchema,
    content: roContentSchema.optional(),
  }),
  z.object({ kind: z.literal("rating"), ...review, rating: roRatingSchema }),
  z
    .object({
      kind: z.literal("controls"),
      ...review,
      state: z.enum(["existing", "none"]),
      controls: z.array(text).max(30),
    })
    .refine((v) => (v.state === "existing" ? v.controls.length > 0 : v.controls.length === 0)),
  z.object({
    kind: z.literal("action"),
    ...review,
    reviewStatus: pipReviewStatusSchema,
    content: roActionContentSchema.optional(),
  }),
  z.object({ kind: z.literal("add_action"), ...review, content: roActionContentSchema }),
  z.object({ kind: z.literal("progress"), ...review, content: roProgressSchema }),
  z.object({ kind: z.literal("effectiveness"), ...review, content: roEffectivenessSchema }),
  z.object({
    kind: z.literal("add_item"),
    reason: text,
    sourceId: z.string().nullable(),
    content: roContentSchema,
  }),
]);
export const roRunSchema = z.object({
  id: z.string(),
  stage: z.enum(["GENERATION", "TREATMENT"]),
  branch: roBranchSchema.nullable(),
  status: z.enum(["DRAFT", "RUNNING", "COMPLETED", "FAILED"]),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export const roRegisterSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  organizationName: z.string(),
  standard: z.string(),
  language: z.enum(["fr", "en", "ar"]),
  revision: z.number(),
  outdated: z.boolean(),
  validatedAt: z.string().nullable(),
  sources: z.array(roSourceSchema),
  items: z.array(roItemSchema),
  runs: z.array(roRunSchema),
});
export const roMaterialSchema = z.object({
  language: z.enum(["fr", "en", "ar"]),
  digest: z.string(),
  sources: z.array(roSourceSchema),
  items: z.array(roItemSchema),
  referenceDate: date,
});
export const roGenerationOutputSchema = z.object({
  items: z
    .array(z.object({ sourceId: z.string(), content: roContentSchema, rating: roRatingSchema }))
    .max(200),
});
export const roTreatmentOutputSchema = z.object({
  items: z
    .array(z.object({ itemId: z.string(), actions: z.array(roActionContentSchema).min(1).max(2) }))
    .max(100),
});
export type RoItem = z.infer<typeof roItemSchema>;
export type RoAction = z.infer<typeof roActionSchema>;
export type RoSource = z.infer<typeof roSourceSchema>;
export type RoRegister = z.infer<typeof roRegisterSchema>;
export type RoMaterial = z.infer<typeof roMaterialSchema>;
export type RoLaunch = z.infer<typeof roLaunchSchema>;
export type RoWrite = z.infer<typeof roWriteSchema>;
export type RoRating = z.infer<typeof roRatingSchema>;
