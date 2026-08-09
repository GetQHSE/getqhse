import type { ProfileFieldKey } from "@qhse/profile";

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
  version: 1,
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
When the user gives one or more answers, call recordProfileAnswers with every explicit fact found.
For each tool answer, valueJson must be valid JSON matching the field described by the current question.
After the tool returns, acknowledge briefly and ask exactly the next question returned by the tool.
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
        knownFields: input.knownFields,
      }),
    };
  },
};
