import type { ContextAnswerAssistResponse, SupportedLanguage } from "@qhse/contracts";

export type ContextAnswerAssistModelInput = {
  sectionTitle: string;
  questionLabel: string;
  /** What is already saved for this question, if anything. */
  savedAnswer: string | null;
  history: { role: "user" | "assistant"; text: string }[];
  message: string;
  /** The project language: the follow-up question is asked in it. */
  language: SupportedLanguage;
};

export abstract class ContextAnswerAssistModelPort {
  abstract assess(input: ContextAnswerAssistModelInput): Promise<ContextAnswerAssistResponse>;
}
