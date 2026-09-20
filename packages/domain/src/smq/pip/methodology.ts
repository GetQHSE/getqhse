/**
 * PIP methodology configuration (version pip-v1).
 *
 * Everything a QHSE expert may legitimately want to change later lives here:
 * category catalogue, relevance labels, scales, criticality bands, strategy
 * mapping, provenance labels. Runs and evaluations persist
 * `methodologyVersion` / `strategyVersion`, so a future revision never
 * rewrites a historical analysis.
 *
 * All scoring is deterministic and computed in code — never asked to a model.
 */

export const PIP_METHODOLOGY_VERSION = "pip-v1";
export const PIP_STRATEGY_VERSION = "strategy-v1";

/** Scales enforced by methodology v1 (and by the database constraints). */
export const PIP_SCALES = {
  power: { min: 1, max: 5 },
  interest: { min: 1, max: 5 },
  impact: { min: 1, max: 3 },
  requirementLevel: { min: 1, max: 3 },
  criticality: { min: 1, max: 9 },
} as const;

export const CRITICALITY_DISCLAIMER =
  "Cette cotation est une méthode d’évaluation interne proposée par GetQhse. Elle ne constitue pas une méthode de cotation imposée par ISO et peut être adaptée à la méthodologie de votre organisation.";

export const RELEVANCE_LABELS: Record<string, string> = {
  relevant: "Pertinente",
  potentially_relevant: "Potentiellement pertinente",
  insufficient_information: "Information insuffisante",
  not_relevant: "Non pertinente",
};

export const REVIEW_LABELS: Record<string, string> = {
  pending: "À valider",
  validated: "Validé",
  modified: "Modifié par un expert",
  not_retained: "Non retenu",
};

export const SCOPE_LABELS: Record<string, string> = {
  internal: "Interne",
  external: "Externe",
};

/** Suggested categories. The AI may propose others; nothing is forced. */
export const PIP_CATEGORIES: { key: string; label: string; scope: "internal" | "external" }[] = [
  { key: "direction", label: "Direction", scope: "internal" },
  { key: "management", label: "Management", scope: "internal" },
  { key: "salaries", label: "Salariés", scope: "internal" },
  { key: "representants_personnel", label: "Représentants du personnel", scope: "internal" },
  { key: "actionnaires", label: "Actionnaires / propriétaires", scope: "internal" },
  { key: "clients", label: "Clients", scope: "external" },
  { key: "fournisseurs", label: "Fournisseurs", scope: "external" },
  { key: "sous_traitants", label: "Sous-traitants / prestataires", scope: "external" },
  { key: "partenaires", label: "Partenaires", scope: "external" },
  { key: "autorites", label: "Autorités et régulateurs", scope: "external" },
  { key: "financiers", label: "Acteurs financiers", scope: "external" },
  { key: "professionnels", label: "Organismes professionnels", scope: "external" },
  { key: "societe", label: "Société et communautés", scope: "external" },
  { key: "autre", label: "Autre partie intéressée", scope: "external" },
];

/** Provenance labels shown to the professional (technical keys stay internal). */
export const PROVENANCE_LABELS: Record<string, string> = {
  profile: "Profil de l’organisation",
  profile_answer: "Profil de l’organisation",
  internal_context: "Contexte interne",
  context_analysis: "Analyse des enjeux",
  context_issue: "Analyse des enjeux",
  regulatory: "Veille réglementaire",
  regulatory_item: "Veille réglementaire",
  ai_sector_knowledge: "Connaissance sectorielle IA",
  user_input: "Information utilisateur",
  normative: "Référentiel normatif",
};

export function provenanceLabel(sourceType: string): string {
  return (
    PROVENANCE_LABELS[sourceType] ??
    sourceType.replace(/[_-]+/g, " ").replace(/^./, (char) => char.toUpperCase())
  );
}

export const REQUIREMENT_SOURCE_LABELS: Record<string, string> = {
  normative: "Exigence normative (référentiel)",
  legal_regulatory: "Obligation légale ou réglementaire",
  contractual: "Engagement contractuel",
  customer: "Exigence client",
  organizational: "Exigence interne de l’organisation",
  stakeholder_expectation: "Attente de la partie intéressée",
};

/* --------------------------- deterministic maths -------------------------- */

export type CriticalityBand = "faible" | "moyenne" | "elevee";

export const CRITICALITY_BANDS: {
  band: CriticalityBand;
  label: string;
  min: number;
  max: number;
}[] = [
  { band: "faible", label: "Faible", min: 1, max: 3 },
  { band: "moyenne", label: "Moyenne", min: 4, max: 6 },
  { band: "elevee", label: "Élevée", min: 7, max: 9 },
];

/** Criticality = impact × niveau d'exigence. Never asked to a model. */
export function computeCriticality(
  impact: number | null | undefined,
  requirementLevel: number | null | undefined,
): number | null {
  if (typeof impact !== "number" || typeof requirementLevel !== "number") return null;
  return impact * requirementLevel;
}

export function criticalityBand(value: number | null | undefined) {
  if (typeof value !== "number") return null;
  return CRITICALITY_BANDS.find((band) => value >= band.min && value <= band.max) ?? null;
}

export type StrategyKey = "key_actor" | "keep_satisfied" | "keep_informed" | "monitor";

/** Power/Interest threshold for methodology v1 on a 1–5 scale. */
const HIGH_THRESHOLD = 4;

export const STRATEGY_LABELS: Record<StrategyKey, { label: string; helper: string }> = {
  key_actor: {
    label: "Gérer attentivement / Acteur clé",
    helper: "Pouvoir élevé et intérêt élevé",
  },
  keep_satisfied: { label: "Garder satisfait", helper: "Pouvoir élevé, intérêt plus faible" },
  keep_informed: { label: "Tenir informé", helper: "Pouvoir plus faible, intérêt élevé" },
  monitor: { label: "Surveiller / Effort proportionné", helper: "Pouvoir et intérêt plus faibles" },
};

export function powerInterestStrategy(
  power: number | null | undefined,
  interest: number | null | undefined,
): StrategyKey | null {
  if (typeof power !== "number" || typeof interest !== "number") return null;
  const highPower = power >= HIGH_THRESHOLD;
  const highInterest = interest >= HIGH_THRESHOLD;
  if (highPower && highInterest) return "key_actor";
  if (highPower) return "keep_satisfied";
  if (highInterest) return "keep_informed";
  return "monitor";
}

export const STRATEGY_DISCLAIMER =
  "Ces stratégies de gestion sont proposées par GetQhse. Elles ne constituent pas une terminologie imposée par ISO.";
