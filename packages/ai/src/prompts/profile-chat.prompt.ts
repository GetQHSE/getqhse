import { getProfileAnswerJsonSchema, type ProfileFieldKey } from "@qhse/profile";

import type { PromptDefinition } from "../prompt-definition.js";
import { outputLanguageRuleEn, type OutputLanguage } from "./language.js";
import { sharedQhseAssistantPolicy } from "../policies/shared.policy.js";

export type ProfileChatPromptInput = {
  language: OutputLanguage;
  currentQuestion: { key: ProfileFieldKey; prompt: string } | null;
  profileRevision: number;
  completenessPercent: number;
  regulatoryReadiness: number;
  knownFields: Array<{ key: ProfileFieldKey; value: unknown; status: string }>;
};

export const profileChatPrompt: PromptDefinition<ProfileChatPromptInput> = {
  key: "profile.chat",
  version: 4,
  build(input) {
    const languageInstruction = outputLanguageRuleEn(input.language);
    return {
      system: `${sharedQhseAssistantPolicy}

You complete an ISO 9001 project profile conversationally.
${languageInstruction}
Ask one primary question at a time and avoid repeating information already recorded.
Accept any understandable answer to the current question, including short, approximate, partial, negative and "I don't know" answers. Spelling, grammar, punctuation, informal wording and a different answer from your suggested examples are never reasons to reject it or ask again.
Ask a clarification only when you cannot understand what the user means or relate it to the current question. Do not require agreement with an example, an exhaustive list, or missing optional details.
When the user answers the current profile question, call recordProfileAnswers exactly once for that field.
Use the currentFieldValueSchema to structure only facts actually given. For descriptive fields, if the details needed for the structured shape are missing, valueJson may be a JSON string preserving the user's answer; do not invent names, categories, boolean flags or other details to fill a schema. Technical fields (employee count, country codes, operating reach, name, logo URL) keep their typed format. Interpret ordinary wording such as country names or approximate numbers without asking the user to format JSON.
Do not call recordProfileAnswers a second time in the same turn.
If the tool accepts the answer, acknowledge it briefly and ask exactly the next question returned by the tool.
If the tool rejects the answer, use its rejection reason to ask one precise clarification question. Do not show a generic failure message and do not advance to another profile question.
If the user did not answer a profile question, help briefly and ask the current question.
Do not mark inferred information as a user fact. Preserve uncertainty and the user’s wording instead of filling gaps or demanding optional details.
Do not conduct regulatory applicability, SWOT, risk, or audit analysis in this module.`,
      context: JSON.stringify({
        module: "PROFILE_COMPLETION",
        schemaVersion: 1,
        profileRevision: input.profileRevision,
        completenessPercent: input.completenessPercent,
        regulatoryReadiness: input.regulatoryReadiness,
        currentQuestion: input.currentQuestion,
        currentFieldValueSchema: input.currentQuestion
          ? getProfileAnswerJsonSchema(input.currentQuestion.key)
          : null,
        knownFields: input.knownFields,
      }),
    };
  },
};
