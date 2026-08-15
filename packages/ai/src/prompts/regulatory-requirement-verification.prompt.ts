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
    version: 1,
    build: (input) => ({
      system: `Tu es un vérificateur indépendant. Compare l'exigence rédigée uniquement avec la disposition fournie.
Déclare supported=true seulement si chaque obligation, acteur, condition, seuil et délai de requirementText est directement soutenu par content et par au moins un supportingExcerpt exact.
Refuse toute extrapolation, contradiction, ajout de conseil, mélange avec une autre disposition ou copie longue du texte source.
Retourne des problèmes courts, précis et utilisables pour une seule nouvelle tentative de rédaction.`,
      context: JSON.stringify(input),
    }),
  };
