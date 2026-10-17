import { renderManagedPrompt } from "../managed-prompts.js";
import { inLanguage, outputLanguageRule, type OutputLanguage } from "./language.js";

/** Three explicit stages; existing material only, no web search or invented ISO clauses. */
export function buildPipPrompt(
  stage: "INVENTORY" | "REQUIREMENTS" | "EVALUATION",
  material: unknown,
  language: OutputLanguage,
) {
  return {
    ...renderManagedPrompt(`pip.${stage.toLowerCase()}`, {
      languageDescription: inLanguage(language),
      languageRule: outputLanguageRule(language),
    }),
    context: JSON.stringify(material),
  };
}
