import { renderManagedPrompt, getPromptDefinition } from "../managed-prompts.js";
import type { PromptDefinition } from "../prompt-definition.js";
import { inLanguage, outputLanguageRule, type OutputLanguage } from "./language.js";

export type RegulatoryConformityPromptInput = {
  profileContext: unknown;
  requirement: {
    text: string;
    applicabilityRationale: string;
    document: string;
    provisionIdentifier: string | null;
    sourceText: string;
    supportingExcerpts: string[];
  };
  evidence: Array<{ kind: string; label: string | null; note: string | null; url: string | null }>;
  knowledgeExamples: unknown[];
  currentDate: string;
  language: OutputLanguage;
};

export const regulatoryConformityPrompt: PromptDefinition<RegulatoryConformityPromptInput> = {
  key: "regulatory.conformity-assessment",
  version: getPromptDefinition("regulatory.conformity-assessment").version,
  build: (input) => ({
    ...renderManagedPrompt("regulatory.conformity-assessment", {
      languageDescription: inLanguage(input.language),
      languageRule: outputLanguageRule(input.language),
    }),
    context: JSON.stringify({ ...input, language: undefined }),
  }),
};
