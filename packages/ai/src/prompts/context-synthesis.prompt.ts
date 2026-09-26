import type { PromptDefinition } from "../prompt-definition.js";
import { CONTEXT_ISO_GUIDANCE } from "./context-external-research.prompt.js";
import { inLanguage, outputLanguageRule, type OutputLanguage } from "./language.js";

/**
 * Tab 3 of "Analyse des enjeux" (ISO 9001 §4.1), "Synthèse des enjeux" — one
 * strict-JSON call, no web search. It pre-evaluates the internal issues the
 * user retained in tab 1 (never rewriting them) and identifies the external
 * issues from the factors documented in tab 2, each rated on impact and on
 * the organisation's capacity to control it.
 */
export type ContextSynthesisPromptInput = {
  digest: string;
  /** The retained internal issues, one per line, referenced I1, I2, … */
  internalIssues: string;
  externalMaterial: string;
  methods: ("SWOT" | "PESTEL")[];
  language: OutputLanguage;
};

export const contextSynthesisPrompt: PromptDefinition<ContextSynthesisPromptInput> = {
  key: "context.synthesis",
  version: 4,
  build: (input) => ({
    system: `Tu es le moteur de synthèse des enjeux de GetQhse AI, aligné sur le chapitre 4.1 d'ISO 9001.
Tu as deux tâches, sur des éléments DÉJÀ ÉTABLIS par la plateforme :
1. Pré-évaluer chaque enjeu interne retenu par l'organisation (références I1, I2, …) dans internalRatings. Tu ne modifies, ne fusionnes et ne supprimes aucun de ces enjeux.
2. Identifier les enjeux externes de l'organisation dans externalIssues, à partir des facteurs externes documentés et du contexte réglementaire établi, et les pré-évaluer de la même manière.
Règles absolues :
- N'utilise QUE le matériel fourni. N'invente aucun fait, aucun chiffre, aucune source, aucune tendance.
- impact est un entier de 1 à 3 : impact de l'enjeu sur la qualité des produits/services et la satisfaction client (1 = faible, 2 = moyen, 3 = élevé).
- mastery est un entier de 1 à 3 : capacité de l'organisation à maîtriser cet enjeu au vu du matériel fourni (1 = faible, 2 = moyenne, 3 = élevée). C'est une pré-évaluation que l'utilisateur ajustera.
- Un enjeu externe est une opportunité ("opportunite") ou une menace ("menace") pour l'organisation, rattaché à au moins une preuve (evidence) copiée du matériel fourni, sans reformulation.
- Un enjeu externe doit être spécifique à l'organisation, jamais une généralité, et ne doit pas répéter un enjeu interne.
- confidence est une estimation interne entre 0 et 1 : elle ne remplace jamais la validation humaine.
- Ne produis pas de plan d'action.
- Rédige tous les champs textuels ${inLanguage(input.language)}.
${outputLanguageRule(input.language)}
Réponds uniquement en JSON valide.

${CONTEXT_ISO_GUIDANCE}`,
    context: [
      "MATÉRIEL INTERNE ÉTABLI :",
      input.digest,
      "",
      "ENJEUX INTERNES RETENUS (étape 1, à pré-évaluer sans les modifier) :",
      input.internalIssues,
      "",
      "FACTEURS EXTERNES DOCUMENTÉS (étape 2, sources réelles) :",
      input.externalMaterial,
      "",
      input.methods.includes("PESTEL")
        ? "categoryKey d'un enjeu externe : la dimension PESTEL concernée (politique, economique, social, technologique, environnemental, legal)."
        : "categoryKey d'un enjeu externe : une clé courte en minuscules sans accent (ex. marche, concurrence, competences).",
      "",
      "Pré-évalue chaque enjeu interne retenu, puis identifie et pré-évalue les enjeux externes.",
    ].join("\n"),
  }),
};
