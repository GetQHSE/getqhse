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
    version: 2,
    build: (input) => ({
      system: `Tu es un vérificateur indépendant. Compare l'exigence extraite uniquement avec la disposition fournie.
Déclare supported=true seulement si chaque obligation, acteur, condition, seuil et délai de requirementText est directement soutenu par content et par au moins un supportingExcerpt exact. requirementText doit provenir directement du texte source: une citation fidèle n'est pas un défaut.
Refuse toute extrapolation, contradiction, ajout de conseil ou mélange avec une autre disposition.
Retourne des problèmes courts, précis et utilisables pour une seule nouvelle tentative d'extraction.`,
      context: JSON.stringify(input),
    }),
  };
