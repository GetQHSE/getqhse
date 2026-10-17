import { renderManagedPrompt, getPromptDefinition } from "../managed-prompts.js";
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
  version: getPromptDefinition("profile.chat").version,
  build(input) {
    const languageInstruction = outputLanguageRuleEn(input.language);
    return {
      ...renderManagedPrompt("profile.chat", {
        assistantPolicy: sharedQhseAssistantPolicy,
        languageRule: languageInstruction,
      }),
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
