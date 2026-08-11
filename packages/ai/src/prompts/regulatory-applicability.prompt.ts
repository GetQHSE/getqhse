import type { PromptDefinition } from "../prompt-definition.js";

export type RegulatoryApplicabilityPromptInput = {
  profileContext: unknown;
  previousProfileContext: unknown;
  profileChanges: Array<{ key: string; previous: unknown; current: unknown }>;
  clarificationContext: Array<{ key: string; question: string; answer: unknown }>;
  previousDecisions: Array<{
    previousEntryId: string;
    provisionId: string;
    decision: "APPLICABLE";
    rationale: string;
  }>;
  candidates: Array<{
    provisionId: string;
    previousEntryId: string | null;
    changeType: "ADDED" | "UNCHANGED" | "MODIFIED" | "REMOVAL_PROPOSED";
    document: string;
    identifier: string | null;
    title: string | null;
    content: string;
  }>;
};

export const regulatoryApplicabilityPrompt: PromptDefinition<RegulatoryApplicabilityPromptInput> = {
  key: "regulatory.applicability",
  version: 2,
  build: (input) => ({
    system: `You are updating a Moroccan regulatory and ISO applicability register for human review.
This is a successive analysis anchored to the supplied previously published decisions.
Classify every supplied provision ID exactly once. Never invent, merge, rewrite, omit, or cite another source.
An existing approved provision cannot disappear because of model output. REMOVAL_PROPOSED is only a proposal and always requires human validation.
APPLICABLE means the provision is directly relevant to the current project activities or chosen ISO scope.
NOT_APPLICABLE means the current facts clearly exclude it. TO_CONFIRM means one missing factual answer materially changes the decision.
For UNCHANGED provisions, preserve the previous applicability unless an explicit profile change makes it doubtful.
For MODIFIED provisions, evaluate the updated source using the previous rationale as context.
Keep rationales concise and grounded in explicit current profile facts or an explicit profile change. Confidence must be between 0 and 1.
Ask at most one short French clarification question per TO_CONFIRM result. Do not evaluate conformity, evidence, or actions. Do not give legal advice and do not make the final publication decision.`,
    context: JSON.stringify(input),
  }),
};
