import { renderManagedPrompt, getPromptDefinition } from "../managed-prompts.js";
import type { PromptDefinition } from "../prompt-definition.js";
import { inLanguage, outputLanguageRule, type OutputLanguage } from "./language.js";

/**
 * Step 1 of "Analyse des enjeux" (ISO 9001 §4.1) — per-question answer
 * assistance, ported from the foundation's profiling-answer validation
 * engine (VALIDATION_SYSTEM_INSTRUCTION) and narrowed to one already-declared
 * internal-context question instead of the whole profiling questionnaire.
 *
 * This never decides the answer for the professional, never invents a
 * company fact, and never determines applicability or conformity — its only
 * job is to judge whether what was just typed is enough to answer THIS
 * question, and if not, ask one short, warm, natural follow-up in the project language.
 */
export type ContextAnswerAssistPromptInput = {
  sectionTitle: string;
  questionLabel: string;
  /** What is already saved for this question, if anything — never rewritten
   * by this call, only used to judge whether the new message completes it. */
  savedAnswer: string | null;
  /** The turns exchanged so far in this session, oldest first. */
  history: { role: "user" | "assistant"; text: string }[];
  message: string;
  language: OutputLanguage;
};

export const contextAnswerAssistPrompt: PromptDefinition<ContextAnswerAssistPromptInput> = {
  key: "context.internal-input-assist",
  version: getPromptDefinition("context.internal-input-assist").version,
  build: (input) => ({
    ...renderManagedPrompt("context.internal-input-assist", {
      languageDescription: inLanguage(input.language),
      languageRule: outputLanguageRule(input.language),
    }),
    context: JSON.stringify({
      section: input.sectionTitle,
      question: input.questionLabel,
      savedAnswer: input.savedAnswer,
      history: input.history,
      message: input.message,
    }),
  }),
};
