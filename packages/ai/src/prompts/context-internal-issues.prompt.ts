import type { PromptDefinition } from "../prompt-definition.js";
import { CONTEXT_ISO_GUIDANCE } from "./context-external-research.prompt.js";
import { inLanguage, outputLanguageRule, type OutputLanguage } from "./language.js";

/**
 * Tab 1 of "Analyse des enjeux" (ISO 9001 §4.1), "Contexte interne": the
 * Assistant QHSE turns the declared internal context into contextualised
 * forces and faiblesses, each tied to the declared fact it comes from. One
 * strict-JSON call, no web search.
 */
export type ContextInternalIssuesPromptInput = {
  digest: string;
  language: OutputLanguage;
};

export const contextInternalIssuesPrompt: PromptDefinition<ContextInternalIssuesPromptInput> = {
  key: "context.internal-issues",
  version: 1,
  build: (input) => ({
    system: `Tu es l'Assistant QHSE de GetQhse AI. Tu transformes le contexte interne déclaré par une organisation en enjeux internes exploitables, alignés sur le chapitre 4.1 d'ISO 9001.
Règles absolues :
- N'utilise QUE le matériel fourni. N'invente aucun fait, aucun chiffre, aucune situation.
- Chaque enjeu est soit une force ("force"), soit une faiblesse ("faiblesse") de l'organisation elle-même. Aucun enjeu externe.
- fact : le fait déclaré qui fonde l'enjeu, résumé en quelques mots sous la forme « Thème : valeur » (par exemple « Communication interne : insuffisante »), fidèle à la réponse de l'organisation.
- evidence : au moins un extrait copié mot pour mot du contexte interne déclaré, avec sourceType "internal_input" et reference = la question concernée.
- title : intitulé court (8 mots au plus). description : une à deux phrases sur l'effet concret de cet enjeu sur la qualité, les clients ou le système de management.
- Produis entre 4 et 8 enjeux, sans doublon. Un enjeu doit être spécifique à cette organisation, jamais une généralité de management ni une reformulation de la question.
- Pas de score, pas de risque, pas de plan d'action.
- Rédige tous les champs textuels ${inLanguage(input.language)}.
${outputLanguageRule(input.language)}
Réponds uniquement en JSON valide.

${CONTEXT_ISO_GUIDANCE}`,
    context: [
      "CONTEXTE INTERNE DÉCLARÉ ET PROFIL VALIDÉ :",
      input.digest,
      "",
      "Déduis les forces et faiblesses internes de cette organisation.",
    ].join("\n"),
  }),
};
