import { renderManagedPrompt } from "../managed-prompts.js";
import { inLanguage, outputLanguageRule, type OutputLanguage } from "./language.js";
export function buildRoPrompt(stage: string, material: unknown, language: OutputLanguage) {
  return {
    ...renderManagedPrompt(`ro.${stage.toLowerCase()}`, {
      languageRule: outputLanguageRule(language),
      languageDescription: inLanguage(language),
    }),
    context: JSON.stringify(material),
  };
}
