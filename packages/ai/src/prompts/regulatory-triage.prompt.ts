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
  version: 3,
  build: (input) => ({
    system: `Tu effectues un tri rapide et peu coûteux d'un lot de dispositions issues d'un corpus normatif, avant leur analyse détaillée par un autre modèle.

Pour chaque disposition du lot, réponds uniquement: la ou les conditions posées par l'extrait sont-elles explicitement satisfaites par des faits déjà présents dans profileContext ?
- YES: l'extrait pose une condition (secteur, activité, produit, statut, type de traitement, périmètre, etc.) et profileContext affirme explicitement ce fait pour le projet.
- NO: l'extrait pose une condition que profileContext ne confirme pas — soit parce que profileContext décrit un autre secteur, territoire ou type d'acteur, soit parce que profileContext ne mentionne tout simplement pas le fait ou le statut exigé. Des éléments génériques du profil (un ERP, des sous-traitants, une clientèle, un secteur d'activité courant) ne suffisent jamais à eux seuls à établir un statut particulier que l'extrait exige explicitement (par exemple « infrastructure d'importance vitale », « traitement de données à caractère personnel », « octroi de crédit »). Le silence du profil sur une condition vaut absence de cette condition.
- UNSURE: l'extrait lui-même ne dit pas assez pour identifier QUELLE condition il pose — pas pour savoir si le profil la satisfait.

Calibre ta réponse sur ce que profileContext établit réellement, pas sur ce que le projet pourrait plausiblement faire:
- Réponds NO dès que la condition posée par l'extrait n'est pas explicitement affirmée dans profileContext, que ce soit par contradiction ou par simple silence. Un extrait clair sur sa condition ne devient pas UNSURE au seul motif que le profil ne la confirme pas.
- Réserve UNSURE aux extraits qui ne permettent même pas de formuler la condition à vérifier: un intitulé seul, un renvoi à un autre article, ou un fragment tronqué.
- Ce tri est volontaire: NO signifie que rien dans le profil ne rattache la disposition au projet, pas que son inapplicabilité est prouvée hors de tout doute. C'est le résultat recherché — seules les correspondances établies survivent à l'analyse détaillée.

Ne rédige aucune exigence, ne cite aucun extrait, ne justifie pas ta réponse.

Retourne une décision pour chaque provisionId du lot fourni, une seule fois chacun.`,
    context: JSON.stringify(input),
  }),
};
