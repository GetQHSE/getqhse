/**
 * Analysis method of the "Analyse des enjeux" module (SWOT or PESTEL).
 *
 * The method is a project-level, persisted CHOICE. It only affects FUTURE runs:
 * every run keeps the method it was executed with in its own scope/inputs, so
 * historical runs stay readable exactly as they were produced. Runs persisted
 * before this choice existed have no stored method and are labelled
 * "méthodologie historique".
 *
 * Whatever the method, the final effective issues keep the SAME normalized
 * downstream contract consumed by the Risks & Opportunities module:
 *   origin: internal | external
 *   nature: force | faiblesse | opportunite | menace
 */

export type ContextAnalysisMethod = "swot" | "pestel";

export const DEFAULT_ANALYSIS_METHOD: ContextAnalysisMethod = "swot";

export const HISTORICAL_METHOD_LABEL = "Méthodologie historique";

export function isAnalysisMethod(value: unknown): value is ContextAnalysisMethod {
  return value === "swot" || value === "pestel";
}

export function analysisMethodLabel(value: unknown): string {
  if (value === "swot") return "SWOT";
  if (value === "pestel") return "PESTEL";
  return HISTORICAL_METHOD_LABEL;
}

export const ANALYSIS_METHOD_OPTIONS: {
  value: ContextAnalysisMethod;
  title: string;
  description: string;
}[] = [
  {
    value: "swot",
    title: "SWOT",
    description:
      "Synthèse globale de votre contexte interne et externe, présentée en Forces, Faiblesses, Opportunités et Menaces.",
  },
  {
    value: "pestel",
    title: "PESTEL",
    description:
      "L’investigation externe est structurée par dimension : politique, économique, social, technologique, environnemental et légal. Votre contexte interne reste collecté (il fait partie du contexte selon l’ISO).",
  },
];

/** PESTEL dimensions. "Légal" is never re-searched: it reuses the regulatory watch. */
export const PESTEL_DIMENSIONS: {
  key: string;
  label: string;
  helper: string;
  matches: string[];
  reusesRegulatory?: boolean;
}[] = [
  {
    key: "politique",
    label: "Politique",
    helper: "Décisions publiques, marchés publics, subventions, stabilité opérationnelle.",
    matches: ["politique", "political", "gouvernance_publique", "public"],
  },
  {
    key: "economique",
    label: "Économique",
    helper: "Marché, coûts, financement, demande, concurrence.",
    matches: [
      "economique",
      "économique",
      "economic",
      "marche",
      "marché",
      "concurrentiel",
      "concurrence",
      "financier",
      "approvisionnement",
      "chaine_dapprovisionnement",
    ],
  },
  {
    key: "social",
    label: "Social",
    helper: "Démographie, attentes clients, main-d’œuvre et compétences disponibles.",
    matches: [
      "social",
      "societal",
      "sociétal",
      "demographique",
      "démographique",
      "client",
      "clients",
      "attentes_clients",
      "main_doeuvre",
      "competences",
      "compétences",
      "emploi",
    ],
  },
  {
    key: "technologique",
    label: "Technologique",
    helper: "Technologies, outils, numérisation, innovation du secteur.",
    matches: [
      "technologique",
      "technological",
      "technique",
      "numerique",
      "numérique",
      "innovation",
    ],
  },
  {
    key: "environnemental",
    label: "Environnemental",
    helper: "Climat, ressources, énergie, contraintes environnementales du secteur.",
    matches: [
      "environnemental",
      "environnement",
      "environmental",
      "climatique",
      "climat",
      "energie",
      "énergie",
      "infrastructures",
      "logistique",
    ],
  },
  {
    key: "legal",
    label: "Légal",
    helper:
      "Cette dimension n’est pas recherchée ici : elle réutilise votre veille réglementaire établie.",
    matches: ["legal", "légal", "juridique", "reglementaire", "réglementaire", "normatif"],
    reusesRegulatory: true,
  },
];

/** Best-effort mapping of a factor/issue category onto a PESTEL dimension. */
export function pestelDimensionKey(
  categoryKey: string | null,
  categoryLabel?: string | null,
): string {
  const haystack = `${categoryKey ?? ""} ${categoryLabel ?? ""}`.toLowerCase().replace(/\s+/g, "_");
  for (const dimension of PESTEL_DIMENSIONS) {
    if (dimension.matches.some((token) => haystack.includes(token))) return dimension.key;
  }
  return "autre";
}

export const SWOT_QUADRANTS: {
  key: "force" | "faiblesse" | "opportunite" | "menace";
  label: string;
  helper: string;
}[] = [
  { key: "force", label: "Forces", helper: "Contexte interne favorable" },
  { key: "faiblesse", label: "Faiblesses", helper: "Contexte interne à renforcer" },
  { key: "opportunite", label: "Opportunités", helper: "Contexte externe favorable" },
  { key: "menace", label: "Menaces", helper: "Contexte externe défavorable" },
];
