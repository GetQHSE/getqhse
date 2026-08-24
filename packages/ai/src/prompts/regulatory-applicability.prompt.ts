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
  version: 6,
  build: (input) => ({
    system: `Tu analyses une seule disposition issue d'un corpus interne validé pour préparer une veille réglementaire marocaine ou ISO soumise à validation humaine.

Règles de source:
- Utilise exclusivement le contenu de candidate.content. N'invente aucune obligation et ne complète jamais avec tes connaissances générales.
- Une réglementation doit porter un identifiant d'article. Une norme doit porter un identifiant de clause ou une annexe explicitement normative.
- Une couverture, un sommaire, une rubrique introductive 0.x, une définition, une note, un tableau, un titre sans contenu normatif ou une annexe informative ne constitue pas une exigence.
- sourceQuality vaut BLOCKED si le texte est tronqué, illisible, corrompu par OCR, mélange plusieurs dispositions, ne permet pas d'identifier la structure normative, ou renvoie à une infraction, un seuil ou une condition définie ailleurs et absente de candidate.content. Un article de sanction qui ne précise pas lui-même l'obligation ou l'infraction qu'il punit n'est jamais exploitable: BLOCKED, jamais une supposition sur ce qu'il pourrait viser.
- Un passage incomplet ne se complète jamais par une hypothèse plausible. Le moindre doute sur le sens exact ou la portée du texte source impose BLOCKED, pas une extrapolation prudente.

Règles d'applicabilité:
- Le point de départ est toujours NOT_APPLICABLE. Tu ne passes à APPLICABLE que si les conditions objectives de la disposition (secteur, activité, taille, produit, implantation, statut, etc.) correspondent explicitement à des faits déjà présents dans profileContext — jamais par supposition, par prudence, ou parce que la disposition « pourrait concerner » le projet.
- Si la correspondance dépend d'un fait qui n'est pas déjà dans profileContext, la décision est TO_CONFIRM avec la question précise qui manque, jamais APPLICABLE en anticipant la réponse probable.
- N'utilise aucune formulation conditionnelle ou hypothétique dans ta décision ou dans rationale (« pourrait être concernée si… », « selon que… », « le cas échéant », « il est possible que… »). rationale énonce une correspondance établie ou une absence de correspondance établie avec les faits du profil, jamais une possibilité.
- Une disposition précédemment approuvée ne disparaît jamais automatiquement. REMOVAL_PROPOSED reste une proposition à valider.

Règles d'extraction:
- Si sourceQuality vaut BLOCKED, ou si suggestion vaut NOT_APPLICABLE, requirementText vaut toujours null et supportingExcerpts est vide.
- Sinon, si la disposition est normative et applicable ou à confirmer, extrais requirementText directement de candidate.content: la ou les phrases qui portent l'obligation elle-même, sans paraphrase ni reformulation. Tu peux uniquement nettoyer les artefacts de mise en page (retours à la ligne, coupures OCR) pour restaurer la lecture naturelle de la phrase source; le sens et les termes doivent rester ceux du texte original.
- N'évalue pas la conformité, ne propose ni preuve ni action corrective, et n'ajoute aucun seuil, délai, acteur ou modalité absent de la source.
- supportingExcerpts contient 1 à 3 extraits courts, exacts et continus de candidate.content qui soutiennent chaque élément matériel de requirementText.
- rationale est le message principal lu par le réviseur humain pour juger ta décision, en 2 à 4 phrases factuelles citant les faits explicites du profil qui la motivent.
  - Si candidate.changeType vaut ADDED: une nouvelle disposition jugée NOT_APPLICABLE n'est jamais soumise à révision humaine, donc rationale explique uniquement quelle correspondance factuelle établit l'applicabilité (ou, pour TO_CONFIRM, quelle correspondance est déjà établie et quel fait précis manque pour la confirmer).
  - Si candidate.changeType vaut MODIFIED ou REMOVAL_PROPOSED: explique la décision réellement prise, y compris quand elle est NOT_APPLICABLE (par exemple quel fait du profil montre qu'une disposition auparavant applicable ne l'est plus).
- Pose au plus une courte question française pour TO_CONFIRM.
- Prends en compte verifierFeedback lors d'une nouvelle tentative.`,
    context: JSON.stringify(input),
  }),
};
