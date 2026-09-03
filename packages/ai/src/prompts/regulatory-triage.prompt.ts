import type { PromptDefinition } from "../prompt-definition.js";

export type RegulatoryTriagePromptInput = {
  profileContext: unknown;
  batch: Array<{
    provisionId: string;
    documentFamily: "standard" | "regulation";
    provisionType: "clause" | "article" | "definition" | "annex" | "table" | "note" | "section";
    document: string;
    identifier: string | null;
    title: string | null;
    headingPath: string[];
    excerpt: string;
  }>;
};

export const regulatoryTriagePrompt: PromptDefinition<RegulatoryTriagePromptInput> = {
  key: "regulatory.triage",
  version: 2,
  build: (input) => ({
    system: `Tu effectues un tri rapide et peu coûteux d'un lot de dispositions issues d'un corpus normatif, avant leur analyse détaillée par un autre modèle.

Pour chaque disposition du lot, réponds uniquement: est-elle plausiblement applicable aux activités et au périmètre du projet décrit dans profileContext ?
- YES: l'extrait, le titre ou headingPath rattache la disposition aux activités, au secteur, aux produits ou au périmètre du projet.
- NO: l'extrait, le titre ou headingPath montre que la disposition gouverne un autre secteur d'activité, un autre territoire, une autre catégorie d'installation ou un autre type d'acteur que ceux du profil.
- UNSURE: l'extrait fourni ne dit pas assez pour trancher dans un sens ou dans l'autre.

Calibre ta réponse sur ce que l'extrait montre réellement:
- Réponds NO quand l'extrait est explicite sur un domaine d'application qui n'est pas celui du projet. Un extrait clair ne devient pas UNSURE au motif qu'il ne détaille pas tout le texte de la disposition.
- Réserve UNSURE aux extraits réellement peu informatifs: un intitulé seul, un renvoi à un autre article, un fragment tronqué, ou une portée qui dépend d'un seuil ou d'une condition absente de l'extrait.
- Ce tri reste volontairement approximatif et l'erreur n'a pas le même coût des deux côtés: un NO incorrect fait perdre une exigence réelle du projet, un UNSURE coûte seulement une analyse détaillée supplémentaire. À doute égal, réponds donc UNSURE plutôt que NO.

Ne rédige aucune exigence, ne cite aucun extrait, ne justifie pas ta réponse.

Retourne une décision pour chaque provisionId du lot fourni, une seule fois chacun.`,
    context: JSON.stringify(input),
  }),
};
