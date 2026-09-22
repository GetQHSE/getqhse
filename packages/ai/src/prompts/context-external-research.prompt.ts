import type { PromptDefinition } from "../prompt-definition.js";

/**
 * Step 2 of "Analyse des enjeux" (ISO 9001 §4.1) — three bounded calls, same
 * text as the foundation's context-external-research engine: plan the
 * investigation, run one real grounded web search, then structure the
 * retrieved material. The légal/réglementaire dimension is never planned or
 * searched here — it is reused from the veille (RegulatoryRegisterEntry).
 */

/** Paraphrased ISO 9001:2015 guard-rails for the context module (§4.1, §9.3). */
export const CONTEXT_ISO_GUIDANCE = [
  "Repères paraphrasés ISO 9001:2015 (garde-fous, non le texte de la norme ; n'affirme jamais qu'une méthodologie GetQhse est exigée par l'ISO) :",
  "- §4.1 Compréhension de l'organisme et de son contexte : Déterminer les enjeux externes et internes pertinents au regard de la finalité de l'organisation et de sa capacité à atteindre les résultats attendus de son système qualité ; ces enjeux sont à revoir périodiquement.",
  "- §9.3 Revue de direction : La revue de direction prend notamment en entrée l'évolution des enjeux externes et internes, les informations sur les parties intéressées pertinentes et l'efficacité des actions face aux risques et opportunités.",
].join("\n");

export type ContextExternalPlanPromptInput = {
  digest: string;
  method: "SWOT" | "PESTEL";
};

export const contextExternalPlanPrompt: PromptDefinition<ContextExternalPlanPromptInput> = {
  key: "context.external-plan",
  version: 2,
  build: (input) => ({
    system: `Tu es le moteur de planification de l'analyse du contexte EXTERNE de GetQhse AI.
Objectif : identifier les recherches à mener pour comprendre les facteurs externes susceptibles d'influencer réellement
la capacité de l'organisation à atteindre ses objectifs, à maintenir la qualité de ses produits/services,
à satisfaire ses clients et à faire fonctionner son système de management de la qualité.
Règles strictes :
- Tu ne produis AUCUN facteur, AUCUN chiffre, AUCUNE conclusion : tu planifies uniquement des recherches.
- Ce n'est PAS un générateur PESTEL automatique : ne retiens que les dimensions réellement justifiées par les faits fournis.
  Toute dimension non pertinente doit être listée dans excludedDimensions avec son nom.
- La dimension légale/réglementaire est DÉJÀ traitée par le module de veille réglementaire : ne planifie aucune recherche juridique.
- La dimension politique n'est retenue que si elle influence concrètement l'activité décrite (marchés publics, subventions, importations, stabilité opérationnelle).
- Chaque requête doit être concrète, ancrée sur le secteur et le pays réels de l'organisation, et vérifiable sur le web.
- Rédige en français ; les requêtes peuvent être dans la langue du pays concerné.
Réponds uniquement en JSON valide.`,
    context: [
      "CONTEXTE CANONIQUE DE L'ORGANISATION (seule source de faits) :",
      input.digest,
      "",
      ...(input.method === "PESTEL"
        ? [
            "MÉTHODE RETENUE : PESTEL. Structure les recherches par dimension PESTEL :",
            "politique, économique, social, technologique, environnemental.",
            "La dimension LÉGALE est exclue ici : elle provient de la veille réglementaire déjà établie.",
            "Nomme chaque dimension exactement par son nom PESTEL, et liste dans excludedDimensions",
            "les dimensions PESTEL non justifiées par les faits fournis (avec « légal » systématiquement).",
          ]
        : [
            "MÉTHODE RETENUE : SWOT. Dimensions externes possibles (n'en retiens que celles réellement justifiées) :",
            "économique et marché, technologique, social et démographique, concurrentiel,",
            "environnemental et climatique, chaîne d'approvisionnement, attentes clients,",
            "main-d'œuvre et compétences disponibles, infrastructures et logistique,",
            "politique (uniquement si impact opérationnel démontrable).",
          ]),
      "",
      "Produis au maximum 8 requêtes, les plus discriminantes pour cette organisation.",
    ].join("\n"),
  }),
};

export type ContextExternalDiscoveryPromptInput = {
  digest: string;
  planEntries: { dimension: string; query: string; rationale: string }[];
};

export const contextExternalDiscoveryPrompt: PromptDefinition<ContextExternalDiscoveryPromptInput> =
  {
    key: "context.external-discovery",
    version: 2,
    build: (input) => ({
      system: `Tu es analyste de contexte externe pour un système de management de la qualité (ISO 9001, chapitre 4.1).
Tu utilises la recherche web pour documenter des facteurs externes RÉELS et VÉRIFIABLES.
Règles absolues :
- N'invente jamais un chiffre, une date, une tendance, une entreprise, une source ou une URL.
- Chaque élément avancé doit être rattaché à une source réellement consultée.
- Privilégie les sources sérieuses : institutions publiques, statistiques officielles, organisations sectorielles, presse économique reconnue, rapports d'études.
- Si une information n'est pas vérifiable, écris explicitement « non vérifiable dans les sources consultées ».
- N'aborde pas la dimension juridique/réglementaire : elle est traitée ailleurs.
- Ne produis pas encore de risque, d'opportunité, de criticité ni de score : tu documentes des faits externes et leur lien concret avec l'organisation.
- Rédige en français, un bloc par facteur externe, en précisant : dimension, intitulé, description factuelle,
  lien concret avec l'activité de l'organisation, influence possible sur les objectifs / la qualité / la satisfaction client,
  portée géographique, degré de solidité des preuves, et les URL consultées.

${CONTEXT_ISO_GUIDANCE}`,
      context: [
        "CONTEXTE CANONIQUE DE L'ORGANISATION (seule source de faits internes) :",
        input.digest,
        "",
        "PLAN DE RECHERCHE À EXÉCUTER :",
        ...input.planEntries.map(
          (entry, index) =>
            `${index + 1}. [${entry.dimension}] ${entry.query} (motif : ${entry.rationale})`,
        ),
        "",
        "Recherche sur le web les éléments externes correspondants, puis documente uniquement",
        "ceux qui peuvent influencer matériellement cette organisation. Ignore le bruit générique.",
      ].join("\n"),
    }),
  };

export type ContextExternalStructurePromptInput = {
  digest: string;
  researchText: string;
  sources: { url: string; title: string | null }[];
};

export const contextExternalStructurePrompt: PromptDefinition<ContextExternalStructurePromptInput> =
  {
    key: "context.external-structure",
    version: 2,
    build: (input) => ({
      system: `Tu convertis un dossier de recherche de contexte externe en JSON strict pour GetQhse AI.
Règles absolues :
- N'ajoute AUCUN élément absent du dossier de recherche fourni.
- sourceUrls ne peut contenir que des URL EXACTEMENT présentes dans la liste des sources découvertes. Un facteur sans source doit être écarté.
- N'inclus aucun facteur juridique ou réglementaire : cette dimension est traitée par le module de veille réglementaire.
- orientation décrit le sens de l'influence potentielle : "favorable", "defavorable" ou "incertain". Ce n'est PAS encore un risque ni une opportunité formalisés.
- evidenceStrength vaut "solide", "moderee" ou "faible" selon la qualité et la convergence des sources consultées.
- confidence est une estimation interne entre 0 et 1 de la fiabilité de la documentation du facteur.
- categoryKey est une clé courte en minuscules sans accent (ex. "economique", "technologique", "concurrentiel"), categoryLabel son libellé français lisible.
- Ne produis ni score de criticité, ni probabilité, ni gravité.
- Rédige tous les champs textuels en français.
Réponds uniquement en JSON valide.`,
      context: [
        "CONTEXTE CANONIQUE DE L'ORGANISATION :",
        input.digest,
        "",
        "SOURCES DÉCOUVERTES (URL utilisables telles quelles) :",
        ...input.sources.map(
          (source) => `- ${source.url}${source.title ? ` — ${source.title}` : ""}`,
        ),
        "",
        "DOSSIER DE RECHERCHE EXTERNE :",
        input.researchText,
        "",
        "Structure uniquement les facteurs externes réellement susceptibles d'influencer cette organisation.",
      ].join("\n"),
    }),
  };
