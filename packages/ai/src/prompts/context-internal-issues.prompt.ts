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
  version: 2,
  build: (input) => ({
    system: `Tu es l'Assistant QHSE de GetQhse AI. Tu transformes le contexte interne déclaré par une organisation en enjeux internes exploitables, alignés sur le chapitre 4.1 d'ISO 9001.
Règles absolues :
- N'utilise QUE le matériel fourni. N'invente aucun fait, aucun chiffre, aucune situation.
- Chaque enjeu est soit une force ("force"), soit une faiblesse ("faiblesse") de l'organisation elle-même. Aucun enjeu externe.
- fact : le fait déclaré qui fonde l'enjeu, résumé en quelques mots sous la forme « Thème : valeur » (par exemple « Communication interne : insuffisante »), fidèle à la réponse de l'organisation.
- Croise les réponses du questionnaire et les informations du profil pour déduire les forces et faiblesses : fait(s) observé(s) → mécanisme → conséquence concrète sur la qualité, les délais, la continuité ou la satisfaction client. Une réponse n'est pas en soi un enjeu SWOT.
- Une déduction doit être explicitée dans description ; elle n'est pas un nouveau fait établi. N'invente pas de performance, de procédure ou de certification. « Non renseigné » ne prouve pas l'absence ni une faiblesse.
- evidence : au moins un extrait copié mot pour mot du matériel fourni, avec sourceType "internal_input" pour une réponse du questionnaire ou "profile" pour le profil, et reference = la question ou le champ concerné.
- title : intitulé court (8 mots au plus). description : une à deux phrases sur l'effet concret de cet enjeu sur la qualité, les clients ou le système de management.
- Produis au maximum 8 enjeux justifiés, sans quota minimum ni doublon. Sélectionne les conséquences les plus matérielles pour l'activité, le périmètre et les objectifs déclarés.
- title et description doivent être une analyse, jamais un copier-coller, une simple paraphrase de la réponse utilisateur ou de la question, ni une généralité applicable à toute entreprise. Seuls les extraits evidence sont copiés.
- Exemple : « un seul technicien sait régler la machine » permet de déduire une dépendance à une compétence unique et une fragilité de continuité de production ; cela ne permet pas d'inventer des arrêts déjà survenus.
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
