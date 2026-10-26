import { renderManagedPrompt, getPromptDefinition } from "../managed-prompts.js";
import type { PromptDefinition } from "../prompt-definition.js";
import { inLanguage, outputLanguageRule, type OutputLanguage } from "./language.js";

export type RegulatoryConformityPromptInput = {
  profileContext: unknown;
  humanDecision?: { result: string; comment?: string | null };
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
  build: (input) => {
    const prompt = renderManagedPrompt("regulatory.conformity-assessment", {
      languageDescription: inLanguage(input.language),
      languageRule: outputLanguageRule(input.language),
    });
    return {
      ...prompt,
      system: input.humanDecision
        ? `${prompt.system}\nThe humanDecision is the authoritative conformity decision. Do not assess or change conformity. Propose a concrete remediation action addressing the human finding and supplied evidence. Return suggestedResult equal to humanDecision.result. Never treat a missing proof as a legal violation or invent organizational facts.`
        : prompt.system,
      context: JSON.stringify({ ...input, language: undefined }),
    };
  },
};
