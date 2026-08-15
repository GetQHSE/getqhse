import type { PromptDefinition } from "../prompt-definition.js";

export type RegulatoryApplicabilityPromptInput = {
  profileContext: unknown;
  previousProfileContext: unknown;
  profileChanges: Array<{ key: string; previous: unknown; current: unknown }>;
  clarificationContext: Array<{ key: string; question: string; answer: unknown }>;
  previousDecision: {
    previousEntryId: string;
    decision: "APPLICABLE";
    rationale: string;
    requirementText: string | null;
  } | null;
  candidate: {
    provisionId: string;
    previousEntryId: string | null;
    changeType: "ADDED" | "UNCHANGED" | "MODIFIED" | "REMOVAL_PROPOSED";
    documentFamily: "standard" | "regulation";
    provisionType: "clause" | "article" | "definition" | "annex" | "table" | "note" | "section";
    document: string;
    identifier: string | null;
    title: string | null;
    content: string;
  };
  verifierFeedback: string[];
};

export const regulatoryApplicabilityPrompt: PromptDefinition<RegulatoryApplicabilityPromptInput> = {
  key: "regulatory.applicability-and-requirement",
  version: 3,
  build: (input) => ({
    system: `Tu analyses une seule disposition issue d'un corpus interne validé pour préparer une veille réglementaire marocaine ou ISO soumise à validation humaine.

Règles de source:
- Utilise exclusivement le contenu de candidate.content. N'invente aucune obligation et ne complète jamais avec tes connaissances générales.
- Une réglementation doit porter un identifiant d'article. Une norme doit porter un identifiant de clause ou une annexe explicitement normative.
- Une couverture, un sommaire, une rubrique introductive 0.x, une définition, une note, un tableau, un titre sans contenu normatif ou une annexe informative ne constitue pas une exigence.
- sourceQuality vaut BLOCKED si le texte est tronqué, illisible, corrompu par OCR, mélange plusieurs dispositions, ne permet pas d'identifier la structure normative ou ne suffit pas à rédiger sans extrapolation.

Règles d'applicabilité:
- APPLICABLE signifie que la disposition concerne directement les activités ou le périmètre ISO du projet.
- NOT_APPLICABLE signifie que les faits fournis l'excluent clairement. TO_CONFIRM signifie qu'une information factuelle manquante change matériellement la décision.
- Une disposition précédemment approuvée ne disparaît jamais automatiquement. REMOVAL_PROPOSED reste une proposition à valider.

Règles de rédaction:
- Si la disposition est normative et potentiellement applicable, rédige requirementText en français, en 1 à 3 phrases concises, comme une exigence opérationnelle fidèle au texte.
- Reformule: ne copie pas un long passage, n'évalue pas la conformité, ne propose ni preuve ni action corrective, et n'ajoute aucun seuil, délai, acteur ou modalité absent de la source.
- supportingExcerpts contient 1 à 3 extraits courts, exacts et continus de candidate.content qui soutiennent chaque élément matériel de requirementText.
- Si aucune exigence ne doit être rédigée, requirementText vaut null et supportingExcerpts est vide.
- La justification reste concise et cite les faits explicites du profil. Pose au plus une courte question française pour TO_CONFIRM.
- Prends en compte verifierFeedback lors d'une nouvelle tentative.`,
    context: JSON.stringify(input),
  }),
};
