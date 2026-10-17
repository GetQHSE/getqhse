import { renderManagedPrompt, getPromptDefinition } from "../managed-prompts.js";
import type { PromptDefinition } from "../prompt-definition.js";
import { inLanguage, outputLanguageRule, type OutputLanguage } from "./language.js";

export type RegulatoryApplicabilityPromptInput = {
  profileContext: unknown;
  previousProfileContext: unknown;
  profileChanges: Array<{ key: string; previous: unknown; current: unknown }>;
  clarificationContext: Array<{ key: string; question: string; answer: unknown }>;
  previousDecision: {
    previousEntryId: string;
    decision: "APPLICABLE";
    rationale: string;
    requirementText: string | null;
  } | null;
  candidate: {
    provisionId: string;
    previousEntryId: string | null;
    changeType: "ADDED" | "UNCHANGED" | "MODIFIED" | "REMOVAL_PROPOSED";
    documentFamily: "standard" | "regulation";
    provisionType: "clause" | "article" | "definition" | "annex" | "table" | "note" | "section";
    document: string;
    identifier: string | null;
    title: string | null;
    content: string;
  };
  legalContext?: { text: string; complete: boolean };
  verifierFeedback: string[];
  /** Language of rationale and clarification question (never of requirementText). */
  language: OutputLanguage;
};

export const regulatoryApplicabilityPrompt: PromptDefinition<RegulatoryApplicabilityPromptInput> = {
  key: "regulatory.applicability-and-requirement",
  version: getPromptDefinition("regulatory.applicability-and-requirement").version,
  build: (input) => ({
    ...renderManagedPrompt("regulatory.applicability-and-requirement", {
      languageDescription: inLanguage(input.language),
      languageRule: outputLanguageRule(input.language),
    }),
    context: JSON.stringify({ ...input, language: undefined }),
  }),
};
