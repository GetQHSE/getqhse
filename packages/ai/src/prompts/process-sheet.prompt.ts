import { renderManagedPrompt } from "../managed-prompts.js";
export function buildProcessSheetPrompt(material: unknown, language: "fr" | "en" | "ar") {
  return {
    ...renderManagedPrompt("process-sheet.activities", { language: language }),
    context: JSON.stringify(material),
  };
}
