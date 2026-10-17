import { renderManagedPrompt, getPromptDefinition } from "../managed-prompts.js";
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
  version: getPromptDefinition("context.synthesis").version,
  build: (input) => ({
    ...renderManagedPrompt("context.synthesis", {
      languageDescription: inLanguage(input.language),
      languageRule: outputLanguageRule(input.language),
      isoGuidance: CONTEXT_ISO_GUIDANCE,
    }),
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
