import { renderManagedPrompt } from "../managed-prompts.js";
export function buildScopePrompt(material: unknown, language: "fr" | "en" | "ar") {
  return {
    ...renderManagedPrompt("scope.proposal", { language: language }),
    context: JSON.stringify(material),
  };
}
