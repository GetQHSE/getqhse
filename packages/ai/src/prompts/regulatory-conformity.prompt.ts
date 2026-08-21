import type { PromptDefinition } from "../prompt-definition.js";

export type RegulatoryConformityPromptInput = {
  profileContext: unknown;
  requirement: {
    text: string;
    applicabilityRationale: string;
    document: string;
    provisionIdentifier: string | null;
    sourceText: string;
    supportingExcerpts: string[];
  };
  evidence: Array<{ kind: string; label: string | null; note: string | null; url: string | null }>;
  currentDate: string;
};

export const regulatoryConformityPrompt: PromptDefinition<RegulatoryConformityPromptInput> = {
  key: "regulatory.conformity-assessment",
  version: 1,
  build: (input) => ({
    system: `Tu réalises une pré-évaluation de conformité d'une exigence réglementaire ou normative déjà déclarée applicable. La décision reste soumise à validation humaine.

Sources autorisées:
- Utilise uniquement le profil du projet, l'exigence, le texte source et les preuves fournies dans le contexte.
- matchedProfileKeys ne contient que des clés réellement présentes dans profileContext.fields et directement utilisées dans le raisonnement.
- N'invente jamais une pratique, une preuve, une personne, une ressource, un budget ou une date.

Décision:
- CONFORMING seulement si les informations disponibles démontrent explicitement que chaque élément matériel de l'exigence est mis en œuvre.
- PARTIAL si certains éléments sont explicitement mis en œuvre et d'autres explicitement absents ou incomplets.
- NON_CONFORMING si une contradiction, une absence ou un écart est explicite. Si les informations sont insuffisantes ou si tu n'es pas sûr, retourne aussi NON_CONFORMING, avec une confiance faible et liste précisément les informations manquantes.
- Le résultat est une recommandation IA, jamais une décision humaine finale.

Remédiation et planification:
- Pour PARTIAL ou NON_CONFORMING, remediationPlan explique concrètement comment atteindre la conformité sans ajouter d'obligation absente de l'exigence.
- actionTitle et effectivenessCriteria peuvent être proposés seulement s'ils découlent directement de l'écart identifié.
- actionResources, actionStartDate, actionDueDate et responsible doivent être null sauf si les sources fournies donnent une information explicite et suffisamment fiable pour ce champ.
- N'utilise jamais currentDate pour inventer une échéance. Une date doit être au format YYYY-MM-DD et provenir explicitement des sources.
- Pour CONFORMING, les champs d'action et remediationPlan sont null.
- missingInformation contient les faits ou preuves nécessaires qui ne sont pas disponibles.

Rédige le raisonnement et les propositions en français, de façon concise et vérifiable.`,
    context: JSON.stringify(input),
  }),
};
