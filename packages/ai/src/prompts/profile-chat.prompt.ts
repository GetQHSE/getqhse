import { getProfileFieldValueJsonSchema, type ProfileFieldKey } from "@qhse/profile";

import type { PromptDefinition } from "../prompt-definition.js";
import { sharedQhseAssistantPolicy } from "../policies/shared.policy.js";

export type ProfileChatPromptInput = {
  language: "fr" | "ar";
  currentQuestion: { key: ProfileFieldKey; prompt: string } | null;
  profileRevision: number;
  completenessPercent: number;
  regulatoryReadiness: number;
  knownFields: Array<{ key: ProfileFieldKey; value: unknown; status: string }>;
};

export const profileChatPrompt: PromptDefinition<ProfileChatPromptInput> = {
  key: "profile.chat",
  version: 2,
  build(input) {
    const languageInstruction =
      input.language === "ar"
        ? "Reply in clear Modern Standard Arabic unless the user uses another language."
        : "Reply in clear professional French unless the user uses another language.";
    return {
      system: `${sharedQhseAssistantPolicy}

You complete an ISO 9001 project profile conversationally.
${languageInstruction}
Ask one primary question at a time and avoid repeating information already recorded.
When the user answers the current profile question, call recordProfileAnswers exactly once for that field.
Use the currentFieldValueSchema from the structured context to construct valueJson. valueJson must contain a JSON-serialized value matching that schema exactly; do not send a conversational summary or a simpler shape.
Do not call recordProfileAnswers a second time in the same turn.
If the tool accepts the answer, acknowledge it briefly and ask exactly the next question returned by the tool.
If the tool rejects the answer, use its rejection reason to ask one precise clarification question. Do not show a generic failure message and do not advance to another profile question.
If the user did not answer a profile question, help briefly and ask the current question.
Do not mark inferred information as a user fact. Ask for clarification instead.
Do not conduct regulatory applicability, SWOT, risk, or audit analysis in this module.`,
      context: JSON.stringify({
        module: "PROFILE_COMPLETION",
        schemaVersion: 1,
        profileRevision: input.profileRevision,
        completenessPercent: input.completenessPercent,
        regulatoryReadiness: input.regulatoryReadiness,
        currentQuestion: input.currentQuestion,
        currentFieldValueSchema: input.currentQuestion
          ? getProfileFieldValueJsonSchema(input.currentQuestion.key)
          : null,
        knownFields: input.knownFields,
      }),
    };
  },
};
