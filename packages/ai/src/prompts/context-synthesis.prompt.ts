import type { PromptDefinition } from "../prompt-definition.js";

/**
 * Step 3 of "Analyse des enjeux" (ISO 9001 §4.1) — one strict-JSON call, no
 * web search: the model reasons only on material the platform already
 * persisted (validated profile, declared internal context, persisted
 * external factors, existing regulatory register). Every issue must cite
 * evidence copied verbatim from that material.
 */
export type ContextSynthesisPromptInput = {
  digest: string;
  externalMaterial: string;
  method: "SWOT" | "PESTEL";
};

export const contextSynthesisPrompt: PromptDefinition<ContextSynthesisPromptInput> = {
  key: "context.synthesis",
  version: 1,
  build: (input) => ({
    system: `Tu es le moteur de synthèse des enjeux, aligné sur le chapitre 4.1 d'ISO 9001.
À partir d'éléments DÉJÀ ÉTABLIS par la plateforme, tu identifies les enjeux internes et externes de l'organisation.
Règles absolues :
- N'utilise QUE le matériel fourni. N'invente aucun fait, aucun chiffre, aucune source, aucune tendance.
- Chaque enjeu doit être rattaché à au moins une preuve (evidence) copiée du matériel fourni, sans reformulation.
- origin = "internal" si l'enjeu provient du contexte interne déclaré ou du profil validé ; "external" s'il provient des facteurs externes documentés ou du contexte réglementaire établi.
- nature : "force" ou "faiblesse" pour les enjeux internes ; "opportunite" ou "menace" pour les enjeux externes.
- Les scores sont des entiers de 1 à 5 exprimant l'influence potentielle (1 = très faible, 5 = très forte).
- recommendedPriority = true uniquement pour les enjeux que tu recommandes réellement de traiter en priorité.
- confidence est une estimation interne entre 0 et 1 : elle ne remplace jamais la validation humaine.
- Un enjeu doit être un véritable enjeu de l'organisation, pas une reformulation de la question posée ni une généralité de management.
- Ne produis pas de plan d'action détaillé.
- Rédige tous les champs textuels en français.
Méthode retenue pour cette analyse : ${input.method}.
Réponds uniquement en JSON valide.`,
    context: [
      "CONTEXTE CANONIQUE DE L'ORGANISATION :",
      input.digest,
      "",
      "FACTEURS EXTERNES DÉJÀ DOCUMENTÉS (étape 2) :",
      input.externalMaterial,
    ].join("\n"),
  }),
};
