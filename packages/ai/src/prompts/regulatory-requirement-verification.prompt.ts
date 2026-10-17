import { renderManagedPrompt, getPromptDefinition } from "../managed-prompts.js";
import type { PromptDefinition } from "../prompt-definition.js";

export type RegulatoryRequirementVerificationPromptInput = {
  document: string;
  identifier: string | null;
  content: string;
  requirementText: string;
  supportingExcerpts: string[];
};

export const regulatoryRequirementVerificationPrompt: PromptDefinition<RegulatoryRequirementVerificationPromptInput> =
  {
    key: "regulatory.requirement-verification",
    version: getPromptDefinition("regulatory.requirement-verification").version,
    build: (input) => ({
      ...renderManagedPrompt("regulatory.requirement-verification"),
      context: JSON.stringify(input),
    }),
  };
