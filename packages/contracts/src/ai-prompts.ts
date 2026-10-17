import { z } from "zod";

export const updatePromptSourceSchema = z
  .object({
    source: z.enum(["CODE", "DATABASE"]),
    expectedGeneration: z.number().int().nonnegative(),
  })
  .strict();

export type PromptSourceView = {
  source: "CODE" | "DATABASE";
  generation: number;
};

export const createPromptRevisionSchema = z
  .object({
    template: z.string().trim().min(1).max(30_000),
    changeNote: z.string().trim().min(3).max(1000),
  })
  .strict();
export const testPromptRevisionSchema = z
  .object({
    language: z.enum(["fr", "en", "ar"]),
    context: z.string().trim().min(1).max(40_000),
    countries: z
      .string()
      .regex(/^[A-Z]{2}(, [A-Z]{2})*$/)
      .max(100)
      .default("MA"),
  })
  .strict();
export const validatePromptRevisionSchema = z
  .object({
    note: z.string().trim().min(8).max(1000),
  })
  .strict();
export const publishPromptRevisionSchema = z
  .object({
    revisionId: z.string().min(1).max(100).nullable(),
    expectedGeneration: z.number().int().nonnegative(),
    action: z.enum(["PUBLISH", "ROLLBACK", "RESET"]),
    note: z.string().trim().min(3).max(1000),
  })
  .strict()
  .refine(
    (value) => (value.action === "RESET") === (value.revisionId === null),
    "Reset uses the bundled default; other actions require a revision",
  );

export type PromptCatalogView = {
  key: string;
  page: string;
  section: string;
  version: number;
  template: string;
  variables: string[];
  protectedVariables: string[];
  legacy: boolean;
  responseMode: "text" | "json";
  activeRevisionId: string | null;
  generation: number;
  activeCompatible: boolean;
};
export type PromptRevisionView = {
  id: string;
  promptKey: string;
  baseVersion: number;
  template: string;
  templateHash: string;
  changeNote: string;
  status: string;
  createdById: string;
  createdAt: string;
  validatedById: string | null;
  validatedAt: string | null;
  validationNote: string | null;
  tests: Array<{
    id: string;
    language: string;
    output: string;
    provider: string;
    model: string;
    createdAt: string;
  }>;
};
export type PromptDetailView = {
  createdRevisionId?: string;
  definition: PromptCatalogView;
  protectedRules: string;
  revisions: PromptRevisionView[];
  publications: Array<{
    id: string;
    action: string;
    revisionId: string | null;
    previousRevisionId: string | null;
    actorId: string;
    note: string;
    createdAt: string;
  }>;
};
