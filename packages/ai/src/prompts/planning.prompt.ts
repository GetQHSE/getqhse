import { renderManagedPrompt } from "../managed-prompts.js";
export function buildPlanningPrompt(material: unknown, language: "fr" | "en" | "ar") {
  return {
    ...renderManagedPrompt(`planning.${(material as { stage: string }).stage}`, {
      language: language,
    }),
    context: JSON.stringify(material),
  };
}
