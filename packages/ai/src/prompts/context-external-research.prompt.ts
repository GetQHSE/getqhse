import { renderManagedPrompt, getPromptDefinition } from "../managed-prompts.js";
import type { PromptDefinition } from "../prompt-definition.js";
import { inLanguage, outputLanguageRule, type OutputLanguage } from "./language.js";

/**
 * Step 2 of "Analyse des enjeux" (ISO 9001 §4.1) — three bounded calls, same
 * text as the foundation's context-external-research engine: plan the
 * investigation, run one real grounded web search, then structure the
 * retrieved material. The légal/réglementaire dimension is never planned or
 * searched here — it is reused from the veille (RegulatoryRegisterEntry).
 */

import { CONTEXT_ISO_GUIDANCE } from "../policies/context-iso.policy.js";
export { CONTEXT_ISO_GUIDANCE } from "../policies/context-iso.policy.js";

export type ContextExternalPlanPromptInput = {
  digest: string;
  methods: ("SWOT" | "PESTEL")[];
  language: OutputLanguage;
};

export const contextExternalPlanPrompt: PromptDefinition<ContextExternalPlanPromptInput> = {
  key: "context.external-plan",
  version: getPromptDefinition("context.external-plan").version,
  build: (input) => ({
    ...renderManagedPrompt("context.external-plan", {
      languageDescription: inLanguage(input.language),
      languageRule: outputLanguageRule(input.language),
    }),
    context: [
      "CONTEXTE CANONIQUE DE L'ORGANISATION (seule source de faits) :",
      input.digest,
      "",
      ...(input.methods.includes("PESTEL")
        ? [
            "ANALYSE PESTEL DEMANDÉE : couvre les dimensions PESTEL justifiées par les faits :",
            "politique, économique, social, technologique, environnemental.",
            "La dimension LÉGALE est exclue ici : elle provient de la veille réglementaire déjà établie.",
            "Nomme chaque dimension exactement par son nom PESTEL, et liste dans excludedDimensions",
            "les dimensions PESTEL non justifiées par les faits fournis (avec « légal » systématiquement).",
          ]
        : []),
      ...(input.methods.includes("SWOT")
        ? [
            "ANALYSE SWOT DEMANDÉE : recherche les opportunités et menaces externes réellement justifiées :",
            "marché et demande, concurrence, attentes clients, main-d'œuvre et compétences disponibles,",
            "chaîne d'approvisionnement, technologies du secteur, infrastructures et logistique,",
            "politique (uniquement si impact opérationnel démontrable).",
            "Nomme chaque dimension par son nom PESTEL le plus proche (ex. « Économique » pour le marché).",
          ]
        : []),
      "",
      "Produis au maximum 8 requêtes, les plus discriminantes pour cette organisation.",
    ].join("\n"),
  }),
};

export type ContextExternalDiscoveryPromptInput = {
  digest: string;
  planEntries: { dimension: string; query: string; rationale: string }[];
  language: OutputLanguage;
};

export const contextExternalDiscoveryPrompt: PromptDefinition<ContextExternalDiscoveryPromptInput> =
  {
    key: "context.external-discovery",
    version: getPromptDefinition("context.external-discovery").version,
    build: (input) => ({
      ...renderManagedPrompt("context.external-discovery", {
        languageDescription: inLanguage(input.language),
        languageRule: outputLanguageRule(input.language),
        isoGuidance: CONTEXT_ISO_GUIDANCE,
      }),
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
  language: OutputLanguage;
};

export const contextExternalStructurePrompt: PromptDefinition<ContextExternalStructurePromptInput> =
  {
    key: "context.external-structure",
    version: getPromptDefinition("context.external-structure").version,
    build: (input) => ({
      ...renderManagedPrompt("context.external-structure", {
        languageDescription: inLanguage(input.language),
        languageRule: outputLanguageRule(input.language),
      }),
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
