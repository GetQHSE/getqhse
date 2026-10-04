import { z } from "zod";
import { scopeFactsSchema } from "./scope.js";
import { processSchema, interactionSchema, objectiveSchema } from "./planning.js";
const field = z.string().trim().max(2000);
export const sheetActivitySchema = z.object({
  id: z.string().min(1),
  activity: field,
  input: field,
  output: field,
  decision: z.enum(["pending", "retained", "rejected"]),
});
export const sheetKpiLinkSchema = z.object({
  id: z.string().min(1),
  objectiveId: z.string().nullable(),
  strategicLabel: field,
  operational: field,
  kpi: field,
});
export const processSheetContentSchema = z.object({
  purpose: field,
  description: z.string().trim().max(6000),
  inputs: field,
  outputs: field,
  authorName: z.string().trim().max(300),
  approverName: z.string().trim().max(300),
  date: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  activities: z.array(sheetActivitySchema).max(60),
  kpiLinks: z.array(sheetKpiLinkSchema).max(30),
  riskIds: z.array(z.string()).max(100),
  requirementIds: z.array(z.string()).max(100),
  referencesReviewed: z.boolean(),
  notes: field,
});
export const processSheetSourcesSchema = z.object({
  facts: scopeFactsSchema,
  map: z
    .object({
      id: z.string(),
      version: z.number().int(),
      current: z.boolean(),
      processes: z.array(processSchema),
      interactions: z.array(interactionSchema),
    })
    .nullable(),
  policy: z.object({ id: z.string(), version: z.number().int(), statement: z.string() }).nullable(),
  objectivesVersionId: z.string().nullable(),
  objectivesVersion: z.number().int().nullable(),
  objectives: z.array(objectiveSchema),
});
export const processSheetMaterialSchema = z.object({
  processId: z.string(),
  sources: processSheetSourcesSchema,
});
export const processSheetVersionSchema = z.object({
  id: z.string(),
  sheetId: z.string(),
  processId: z.string(),
  version: z.number().int(),
  content: processSheetContentSchema,
  sourceSnapshot: processSheetMaterialSchema,
  fingerprint: z.string(),
  validatedById: z.string(),
  validatedAt: z.string(),
});
export const processSheetSchema = z.object({
  id: z.string(),
  processId: z.string(),
  revision: z.number().int(),
  content: processSheetContentSchema,
  sourceSnapshot: processSheetMaterialSchema,
  fingerprint: z.string(),
  current: z.boolean(),
  available: z.boolean(),
  updatedAt: z.string(),
});
export const processSheetRegisterSchema = z.object({
  projectId: z.string(),
  sources: processSheetSourcesSchema,
  sheets: z.array(processSheetSchema),
  versions: z.array(processSheetVersionSchema),
  runs: z.array(
    z.object({
      id: z.string(),
      sheetId: z.string(),
      revision: z.number().int(),
      status: z.string(),
      error: z.string().nullable(),
      applied: z.boolean(),
      createdAt: z.string(),
    }),
  ),
});
export const processSheetPrepareSchema = z.object({ processId: z.string().min(1) });
export const processSheetWriteSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("save"),
    revision: z.number().int().min(0),
    content: processSheetContentSchema,
  }),
  z.object({ kind: z.literal("refresh_sources"), revision: z.number().int().min(0) }),
  z.object({ kind: z.literal("validate"), revision: z.number().int().min(0) }),
  z.object({ kind: z.literal("apply"), revision: z.number().int().min(0), runId: z.string() }),
]);
export const processSheetLaunchSchema = z.object({ revision: z.number().int().min(0) });
export const processSheetProposalSchema = z.object({
  activities: z
    .array(
      sheetActivitySchema.omit({ id: true, decision: true }).extend({
        activity: z.string().trim().min(5).max(2000),
        input: z.string().trim().min(2).max(2000),
        output: z.string().trim().min(2).max(2000),
      }),
    )
    .min(1)
    .max(20),
});
export const processSheetGenerationSchema = z.object({
  material: processSheetMaterialSchema,
  content: processSheetContentSchema,
});
export type ProcessSheetContent = z.infer<typeof processSheetContentSchema>;
export type ProcessSheetMaterial = z.infer<typeof processSheetMaterialSchema>;
export type ProcessSheetSources = z.infer<typeof processSheetSourcesSchema>;
export type ProcessSheetWrite = z.infer<typeof processSheetWriteSchema>;
export type ProcessSheetRegister = z.infer<typeof processSheetRegisterSchema>;
export type ProcessSheetVersion = z.infer<typeof processSheetVersionSchema>;
export type ProcessSheetGeneration = z.infer<typeof processSheetGenerationSchema>;
