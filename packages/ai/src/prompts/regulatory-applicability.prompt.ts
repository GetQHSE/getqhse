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
  version: 5,
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

Règles d'extraction:
- Si la disposition est normative et potentiellement applicable, extrais requirementText directement de candidate.content: la ou les phrases qui portent l'obligation elle-même, sans paraphrase ni reformulation. Tu peux uniquement nettoyer les artefacts de mise en page (retours à la ligne, coupures OCR) pour restaurer la lecture naturelle de la phrase source; le sens et les termes doivent rester ceux du texte original.
- N'évalue pas la conformité, ne propose ni preuve ni action corrective, et n'ajoute aucun seuil, délai, acteur ou modalité absent de la source.
- supportingExcerpts contient 1 à 3 extraits courts, exacts et continus de candidate.content qui soutiennent chaque élément matériel de requirementText.
- Si aucune exigence ne peut être extraite fidèlement (texte tronqué, incohérent ou non normatif), requirementText vaut null et supportingExcerpts est vide.
- rationale est le message principal lu par le réviseur humain pour juger ta décision, en 2 à 4 phrases précises citant les faits explicites du profil qui la motivent.
  - Si candidate.changeType vaut ADDED: une nouvelle disposition jugée NOT_APPLICABLE n'est jamais soumise à révision humaine, donc rationale explique uniquement pourquoi la disposition s'applique au projet (ou, pour TO_CONFIRM, pourquoi elle s'appliquerait probablement et quel fait manque pour le confirmer).
  - Si candidate.changeType vaut MODIFIED ou REMOVAL_PROPOSED: explique la décision réellement prise, y compris quand elle est NOT_APPLICABLE (par exemple pourquoi une disposition auparavant applicable ne l'est plus).
- Pose au plus une courte question française pour TO_CONFIRM.
- Prends en compte verifierFeedback lors d'une nouvelle tentative.`,
    context: JSON.stringify(input),
  }),
};
