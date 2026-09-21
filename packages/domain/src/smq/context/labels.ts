/**
 * Presentation-only labels and audit grouping.
 *
 * The database keeps raw, append-only correction rows and raw evidence
 * `sourceType` values. Nothing here writes or rewrites data: it only turns
 * technical identifiers into professional French labels, and groups the
 * corrections produced by ONE user action into ONE readable audit event.
 */

const EVIDENCE_SOURCE_LABELS: Record<string, string> = {
  internal_context: "Contexte interne",
  internal_input: "Contexte interne",
  external_factor: "Analyse externe",
  external_factors: "Analyse externe",
  profile_answer: "Profil de l’organisation",
  profile: "Profil de l’organisation",
  regulatory_item: "Veille réglementaire",
  regulatory: "Veille réglementaire",
  user_input: "Information ajoutée par l’utilisateur",
  user_evidence: "Information ajoutée par l’utilisateur",
  document: "Document fourni",
};

/** The shape groupCorrections/hasAnalysisCorrection need from a correction row. */
export interface ContextIssueCorrectionLike {
  id: string;
  fieldName: string;
  previousValue: unknown;
  newValue: unknown;
  correctionReason: string | null;
  createdAt: string;
}

export function evidenceSourceLabel(sourceType: string): string {
  return (
    EVIDENCE_SOURCE_LABELS[sourceType] ??
    sourceType.replace(/[_-]+/g, " ").replace(/^./, (char) => char.toUpperCase())
  );
}

/** Fields that represent a real human change to the analysis itself. */
export const ANALYSIS_FIELDS = new Set([
  "title",
  "description",
  "nature",
  "origin",
  "category_key",
  "category_label",
  "impact_quality",
  "impact_customer_satisfaction",
  "impact_overall",
  "scores",
]);

const FIELD_LABELS: Record<string, string> = {
  title: "Intitulé modifié",
  description: "Description modifiée",
  nature: "Nature de l’enjeu modifiée",
  origin: "Origine de l’enjeu modifiée",
  category_key: "Catégorie modifiée",
  category_label: "Catégorie modifiée",
  impact_quality: "Impact qualité modifié",
  impact_customer_satisfaction: "Impact satisfaction client modifié",
  impact_overall: "Impact global modifié",
  scores: "Scores d’impact modifiés",
};

export interface AuditEvent {
  id: string;
  createdAt: string;
  label: string;
  reason: string | null;
  details: string[];
}

function reviewStatusLabel(value: unknown): string | null {
  if (value === "validated") return "Enjeu validé par la revue humaine";
  if (value === "not_retained") return "Enjeu non retenu";
  if (value === "modified") return "Analyse modifiée par un expert";
  if (value === "pending") return "Enjeu réintégré à la revue";
  return null;
}

/** Groups raw corrections of one logical user action into one audit event. */
export function groupCorrections(corrections: ContextIssueCorrectionLike[]): AuditEvent[] {
  const buckets = new Map<string, ContextIssueCorrectionLike[]>();

  for (const correction of corrections) {
    const second = new Date(correction.createdAt).toISOString().slice(0, 19);
    const key = `${second}|${correction.correctionReason ?? ""}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(correction);
    buckets.set(key, bucket);
  }

  const events: AuditEvent[] = [];

  for (const bucket of buckets.values()) {
    const status = bucket.find((item) => item.fieldName === "review_status");
    const priority = bucket.find((item) => item.fieldName === "user_selected_priority");
    const analysis = bucket.filter((item) => ANALYSIS_FIELDS.has(item.fieldName));

    let label: string | null = status ? reviewStatusLabel(status.newValue) : null;
    if (!label && analysis.length > 0) {
      label = FIELD_LABELS[analysis[0]!.fieldName] ?? "Analyse modifiée par un expert";
    }
    if (!label && priority) {
      label = priority.newValue === true ? "Enjeu marqué prioritaire" : "Priorité retirée";
    }

    const details: string[] = [];
    for (const item of analysis) {
      const detail = FIELD_LABELS[item.fieldName];
      if (detail && detail !== label) details.push(detail);
    }
    if (priority && label !== "Enjeu marqué prioritaire" && label !== "Priorité retirée") {
      details.push(priority.newValue === true ? "Marqué prioritaire" : "Retiré des priorités");
    }

    const first = bucket[0]!;
    events.push({
      id: first.id,
      createdAt: first.createdAt,
      label: label ?? "Décision enregistrée",
      reason: first.correctionReason ?? null,
      details,
    });
  }

  return events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** True when the human changed the analysis itself, not only its review state. */
export function hasAnalysisCorrection(corrections: ContextIssueCorrectionLike[]): boolean {
  return corrections.some((correction) => ANALYSIS_FIELDS.has(correction.fieldName));
}
