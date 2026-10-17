import { renderManagedPrompt, getPromptDefinition } from "../managed-prompts.js";
import type { PromptDefinition } from "../prompt-definition.js";
import { CONTEXT_ISO_GUIDANCE } from "./context-external-research.prompt.js";
import { inLanguage, outputLanguageRule, type OutputLanguage } from "./language.js";

/**
 * Tab 1 of "Analyse des enjeux" (ISO 9001 §4.1), "Contexte interne": the
 * Assistant QHSE turns the declared internal context into contextualised
 * forces and faiblesses, each tied to the declared fact it comes from. One
 * strict-JSON call, no web search.
 */
export type ContextInternalIssuesPromptInput = {
  digest: string;
  language: OutputLanguage;
};

export const contextInternalIssuesPrompt: PromptDefinition<ContextInternalIssuesPromptInput> = {
  key: "context.internal-issues",
  version: getPromptDefinition("context.internal-issues").version,
  build: (input) => ({
    ...renderManagedPrompt("context.internal-issues", {
      languageDescription: inLanguage(input.language),
      languageRule: outputLanguageRule(input.language),
      isoGuidance: CONTEXT_ISO_GUIDANCE,
    }),
    context: [
      "CONTEXTE INTERNE DÉCLARÉ ET PROFIL VALIDÉ :",
      input.digest,
      "",
      "Déduis les forces et faiblesses internes de cette organisation.",
    ].join("\n"),
  }),
};
