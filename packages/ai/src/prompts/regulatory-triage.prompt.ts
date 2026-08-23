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
    excerpt: string;
  }>;
};

export const regulatoryTriagePrompt: PromptDefinition<RegulatoryTriagePromptInput> = {
  key: "regulatory.triage",
  version: 1,
  build: (input) => ({
    system: `Tu effectues un tri rapide et peu coûteux d'un lot de dispositions issues d'un corpus normatif, avant leur analyse détaillée par un autre modèle.

Pour chaque disposition du lot, réponds uniquement: est-elle plausiblement applicable aux activités et au périmètre du projet décrit dans profileContext ?
- YES: la disposition concerne manifestement les activités, le secteur ou le périmètre du projet.
- NO: la disposition est manifestement hors sujet pour ce projet (secteur, périmètre ou territoire différents).
- UNSURE: le lien n'est pas évident à partir du seul extrait fourni.

Ce tri est volontairement rapide et approximatif: en cas de doute, réponds UNSURE plutôt que NO. Une décision NO incorrecte fait perdre une exigence réelle du projet; une décision UNSURE coûte seulement une analyse détaillée supplémentaire. Ne rédige aucune exigence, ne cite aucun extrait, ne justifie pas ta réponse.

Retourne une décision pour chaque provisionId du lot fourni, une seule fois chacun.`,
    context: JSON.stringify(input),
  }),
};
