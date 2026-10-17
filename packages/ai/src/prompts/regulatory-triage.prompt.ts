import { renderManagedPrompt, getPromptDefinition } from "../managed-prompts.js";
import type { PromptDefinition } from "../prompt-definition.js";

export type RegulatoryTriagePromptInput = {
  profileContext: unknown;
  batch: Array<{
    provisionId: string;
    documentFamily: "standard" | "regulation";
    provisionType: "clause" | "article" | "definition" | "annex" | "table" | "note" | "section";
    document: string;
    identifier: string | null;
    title: string | null;
    headingPath: string[];
    excerpt: string;
  }>;
};

export const regulatoryTriagePrompt: PromptDefinition<RegulatoryTriagePromptInput> = {
  key: "regulatory.triage",
  version: getPromptDefinition("regulatory.triage").version,
  build: (input) => ({
    ...renderManagedPrompt("regulatory.triage"),
    context: JSON.stringify(input),
  }),
};
