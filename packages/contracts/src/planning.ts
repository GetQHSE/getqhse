import { z } from "zod";
import { scopeFactsSchema } from "./scope.js";
export const planningModuleSchema = z.enum(["policy", "processes"]);
export const planningStageSchema = z.enum([
  "axes",
  "statement",
  "objectives",
  "processes",
  "interactions",
]);
const field = z.string().trim().max(600);
const decision = z.enum(["pending", "retained", "rejected"]);
const identity = { id: z.string().min(1), decision };
export const directionsSchema = z.object({
  priorities: z
    .array(
      z.enum([
        "growth",
        "customer_satisfaction",
        "nonconformities",
        "profitability",
        "innovation",
        "international",
        "operational_performance",
        "digitalization",
        "skills",
        "other",
      ]),
    )
    .max(10),
  otherPriority: field,
  style: z.enum(["synthetique", "institutionnel", "engage"]).nullable(),
  signatoryRole: field,
  signatoryName: field,
  internalNote: z.string().max(2000),
});
export const axisSchema = z.object({
  ...identity,
  title: z.string().trim().min(6).max(120),
  rationale: z.string().trim().min(20).max(600),
});
export const objectiveSchema = z.object({
  ...identity,
  axisId: z.string().min(1),
  title: z.string().trim().min(8).max(180),
  indicator: field,
  method: field,
  unit: field,
  baseline: field,
  target: field,
  deadline: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  frequency: field,
  owner: field,
});
export const processSchema = z.object({
  ...identity,
  title: z.string().trim().min(3).max(120),
  purpose: field,
  inputs: field,
  outputs: field,
  family: z.enum(["management", "realization", "support"]),
  pilotName: field,
  pilotRole: field,
});
export const interactionSchema = z.object({
  ...identity,
  from: z.string().min(1),
  to: z.string().min(1),
  flow: z.string().trim().min(3).max(600),
});
export const planningDocumentSchema = z.object({
  directions: directionsSchema,
  axes: z.array(axisSchema).max(30),
  statement: z.string().max(6000),
  policyVersionId: z.string().nullable(),
  objectives: z.array(objectiveSchema).max(50),
  processes: z.array(processSchema).max(50),
  interactions: z.array(interactionSchema).max(150),
});
export const planningSourcesSchema = z.object({
  facts: scopeFactsSchema,
  scope: z
    .object({ id: z.string(), version: z.number(), statement: z.string(), current: z.boolean() })
    .nullable(),
});
export const planningVersionSchema = z.object({
  id: z.string(),
  kind: z.enum(["policy", "objectives", "processes"]),
  version: z.number().int(),
  document: planningDocumentSchema,
  sources: planningSourcesSchema,
  fingerprint: z.string(),
  authorId: z.string(),
  createdAt: z.string(),
});
export const planningRegisterSchema = z.object({
  projectId: z.string(),
  module: planningModuleSchema,
  revision: z.number().int(),
  document: planningDocumentSchema,
  sources: planningSourcesSchema,
  fingerprint: z.string(),
  current: z.boolean(),
  versions: z.array(planningVersionSchema),
  runs: z.array(
    z.object({
      id: z.string(),
      stage: planningStageSchema,
      revision: z.number().int(),
      applied: z.boolean(),
      status: z.string(),
      error: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export const planningWriteSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("save"),
    revision: z.number().int().min(0),
    document: planningDocumentSchema,
  }),
  z.object({ kind: z.literal("review_sources"), revision: z.number().int().min(0) }),
  z.object({
    kind: z.literal("validate"),
    revision: z.number().int().min(0),
    target: z.enum(["policy", "objectives", "processes"]),
  }),
  z.object({ kind: z.literal("apply"), revision: z.number().int().min(0), runId: z.string() }),
]);
export const planningLaunchSchema = z.object({
  revision: z.number().int().min(0),
  stage: planningStageSchema,
});
export const planningProposalSchema = z.object({
  axes: z.array(axisSchema.omit({ id: true, decision: true })).max(5),
  statement: z.string().max(6000),
  objectives: z
    .array(
      objectiveSchema.omit({
        id: true,
        decision: true,
        baseline: true,
        target: true,
        deadline: true,
        owner: true,
      }),
    )
    .max(8),
  processes: z
    .array(processSchema.omit({ id: true, decision: true, pilotName: true, pilotRole: true }))
    .max(20),
  interactions: z.array(interactionSchema.omit({ id: true, decision: true })).max(80),
});
export const planningMaterialSchema = z.object({
  module: planningModuleSchema,
  stage: planningStageSchema,
  sources: planningSourcesSchema,
  document: planningDocumentSchema,
  fingerprint: z.string(),
});
export type PlanningModule = z.infer<typeof planningModuleSchema>;
export type PlanningDocument = z.infer<typeof planningDocumentSchema>;
export type PlanningRegister = z.infer<typeof planningRegisterSchema>;
export type PlanningVersion = z.infer<typeof planningVersionSchema>;
export type PlanningWrite = z.infer<typeof planningWriteSchema>;
export type PlanningLaunch = z.infer<typeof planningLaunchSchema>;
export type PlanningMaterial = z.infer<typeof planningMaterialSchema>;
