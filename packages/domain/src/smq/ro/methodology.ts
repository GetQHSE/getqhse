/**
 * "Analyse des risques & opportunités" methodology (version ro-v2).
 *
 * Everything a QHSE expert may legitimately want to change later lives here:
 * scales, level bands, default priority mapping, vocabularies, labels. Runs and
 * evaluations persist `methodology_version`, so a future revision never
 * rewrites a historical analysis.
 *
 * All scoring is deterministic and computed in code — never asked to a model.
 */

export const RO_METHODOLOGY_VERSION = "ro-v2";

export const RO_SCALES = {
  probability: { min: 1, max: 5 },
  impact: { min: 1, max: 5 },
  feasibility: { min: 1, max: 5 },
  benefit: { min: 1, max: 5 },
  score: { min: 1, max: 25 },
} as const;

export const RO_METHOD_DISCLAIMER =
  "Cette cotation est une méthode d’évaluation interne proposée par GetQhse. Elle ne constitue pas une méthode imposée par ISO 9001 et peut être adaptée à la méthodologie de votre organisation.";

/* --------------------------------- labels --------------------------------- */

export const ITEM_TYPE_LABELS: Record<string, string> = {
  risk: "Risque",
  opportunity: "Opportunité",
};

export const REVIEW_LABELS: Record<string, string> = {
  pending: "À examiner",
  validated: "Retenu",
  modified: "Retenu et corrigé",
  not_retained: "Non retenu",
};

export const SWOT_LABELS: Record<string, string> = {
  strength: "Force",
  weakness: "Faiblesse",
  opportunity: "Opportunité",
  threat: "Menace",
};

export const ORIGIN_LABELS: Record<string, string> = {
  internal: "Enjeu interne",
  external: "Enjeu externe",
};

export const CONTROLS_STATE_LABELS: Record<string, string> = {
  a_renseigner: "À renseigner",
  oui: "Des maîtrises existent",
  non: "Aucune maîtrise en place",
};

export const ACTION_STATUS_LABELS: Record<string, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  terminee: "Terminée",
  annulee: "Annulée",
};

/** Derived only — never persisted as a professional status. */
export const OVERDUE_LABEL = "En retard";

export const EFFECTIVENESS_LABELS: Record<string, string> = {
  non_evaluee: "Non évaluée",
  efficace: "Efficace",
  partiellement_efficace: "Partiellement efficace",
  inefficace: "Inefficace",
};

export const ACTION_TYPES: { key: string; label: string }[] = [
  { key: "eviter", label: "Éviter la situation" },
  { key: "reduire", label: "Réduire la probabilité ou l’impact" },
  { key: "partager", label: "Partager ou transférer" },
  { key: "accepter", label: "Accepter en connaissance de cause" },
  { key: "saisir", label: "Saisir l’opportunité" },
  { key: "renforcer", label: "Renforcer une pratique existante" },
];

export function actionTypeLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return ACTION_TYPES.find((type) => type.key === key)?.label ?? key;
}

/* ------------------------------- risk scoring ------------------------------ */

export interface Band {
  label: string;
  tone: "success" | "info" | "warning" | "danger";
}

export function riskScore(
  probability: number | null | undefined,
  impact: number | null | undefined,
): number | null {
  if (!probability || !impact) return null;
  return probability * impact;
}

export function riskBand(score: number | null | undefined): Band | null {
  if (!score) return null;
  if (score <= 4) return { label: "Faible", tone: "success" };
  if (score <= 9) return { label: "Modéré", tone: "info" };
  if (score <= 15) return { label: "Élevé", tone: "warning" };
  return { label: "Critique", tone: "danger" };
}

/** Default priority proposed by the methodology; the professional may override. */
export function defaultRiskPriority(score: number | null | undefined): string | null {
  if (!score) return null;
  if (score <= 4) return "P4";
  if (score <= 9) return "P3";
  if (score <= 15) return "P2";
  return "P1";
}

/* --------------------------- opportunity scoring -------------------------- */

export function opportunityScore(
  feasibility: number | null | undefined,
  benefit: number | null | undefined,
): number | null {
  if (!feasibility || !benefit) return null;
  return feasibility * benefit;
}

export function opportunityBand(score: number | null | undefined): Band | null {
  if (!score) return null;
  if (score <= 4) return { label: "Faible", tone: "success" };
  if (score <= 9) return { label: "Intéressante", tone: "info" };
  if (score <= 15) return { label: "Forte", tone: "warning" };
  return { label: "Stratégique", tone: "danger" };
}

export function defaultOpportunityPriority(score: number | null | undefined): string | null {
  if (!score) return null;
  if (score <= 4) return "P4";
  if (score <= 9) return "P3";
  if (score <= 15) return "P2";
  return "P1";
}

export const PRIORITY_LABELS: Record<string, string> = {
  P1: "P1 — Traitement immédiat",
  P2: "P2 — Traitement planifié",
  P3: "P3 — Sous surveillance",
  P4: "P4 — Acceptable en l’état",
};

/* ------------------------------- provenance ------------------------------- */

export const PROVENANCE_LABELS: Record<string, string> = {
  profile: "Profil de l’organisation",
  internal_context: "Contexte interne",
  context_analysis: "Analyse des enjeux",
  context_issue: "Analyse des enjeux",
  regulatory: "Veille réglementaire",
  ai_sector_knowledge: "Connaissance sectorielle IA",
  user_input: "Information utilisateur",
};

export function provenanceLabel(sourceType: string): string {
  return (
    PROVENANCE_LABELS[sourceType] ??
    sourceType.replace(/[_-]+/g, " ").replace(/^./, (char) => char.toUpperCase())
  );
}

/** Business functions proposed for responsibility; free text stays possible. */
export const RO_PROCESS_SUGGESTIONS: string[] = [
  "Direction",
  "Commercial",
  "Production",
  "Achats",
  "Logistique",
  "Qualité",
  "Ressources humaines",
  "Maintenance",
  "Informatique",
  "Finance",
];
