import type { ContextAnswerAssistResponse } from "@qhse/contracts";

export type ContextAnswerAssistModelInput = {
  sectionTitle: string;
  questionLabel: string;
  /** What is already saved for this question, if anything. */
  savedAnswer: string | null;
  history: { role: "user" | "assistant"; text: string }[];
  message: string;
};

export abstract class ContextAnswerAssistModelPort {
  abstract assess(input: ContextAnswerAssistModelInput): Promise<ContextAnswerAssistResponse>;
}
