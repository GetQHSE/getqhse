/**
 * Presentation-only labels and audit grouping.
 *
 * The database keeps raw, append-only correction rows and raw evidence
 * `sourceType` values. Nothing here writes or rewrites data: it only turns
 * technical identifiers into professional labels (French by default), and
 * groups the corrections produced by ONE user action into ONE readable audit
 * event.
 */

import type { Language, Localized } from "../../language.js";

const INTERNAL_CONTEXT: Localized = {
  fr: "Contexte interne",
  en: "Internal context",
  ar: "السياق الداخلي",
};
const EXTERNAL_ANALYSIS: Localized = {
  fr: "Analyse externe",
  en: "External analysis",
  ar: "التحليل الخارجي",
};
const ORGANIZATION_PROFILE: Localized = {
  fr: "Profil de l’organisation",
  en: "Organisation profile",
  ar: "ملف المؤسسة",
};
const REGULATORY_WATCH: Localized = {
  fr: "Veille réglementaire",
  en: "Regulatory watch",
  ar: "اليقظة التنظيمية",
};
const USER_INFORMATION: Localized = {
  fr: "Information ajoutée par l’utilisateur",
  en: "Information added by the user",
  ar: "معلومة أضافها المستخدم",
};

const EVIDENCE_SOURCE_LABELS: Record<string, Localized> = {
  internal_context: INTERNAL_CONTEXT,
  internal_input: INTERNAL_CONTEXT,
  external_factor: EXTERNAL_ANALYSIS,
  external_factors: EXTERNAL_ANALYSIS,
  profile_answer: ORGANIZATION_PROFILE,
  profile: ORGANIZATION_PROFILE,
  regulatory_item: REGULATORY_WATCH,
  regulatory: REGULATORY_WATCH,
  user_input: USER_INFORMATION,
  user_evidence: USER_INFORMATION,
  document: { fr: "Document fourni", en: "Provided document", ar: "وثيقة مقدَّمة" },
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

export function evidenceSourceLabel(sourceType: string, language: Language = "fr"): string {
  return (
    EVIDENCE_SOURCE_LABELS[sourceType]?.[language] ??
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

const CATEGORY_CHANGED: Localized = {
  fr: "Catégorie modifiée",
  en: "Category changed",
  ar: "تم تعديل الفئة",
};

const FIELD_LABELS: Record<string, Localized> = {
  title: { fr: "Intitulé modifié", en: "Title changed", ar: "تم تعديل العنوان" },
  description: { fr: "Description modifiée", en: "Description changed", ar: "تم تعديل الوصف" },
  nature: {
    fr: "Nature de l’enjeu modifiée",
    en: "Issue type changed",
    ar: "تم تعديل طبيعة الرهان",
  },
  origin: {
    fr: "Origine de l’enjeu modifiée",
    en: "Issue origin changed",
    ar: "تم تعديل مصدر الرهان",
  },
  category_key: CATEGORY_CHANGED,
  category_label: CATEGORY_CHANGED,
  impact_quality: {
    fr: "Impact qualité modifié",
    en: "Quality impact changed",
    ar: "تم تعديل الأثر على الجودة",
  },
  impact_customer_satisfaction: {
    fr: "Impact satisfaction client modifié",
    en: "Customer satisfaction impact changed",
    ar: "تم تعديل الأثر على رضا العملاء",
  },
  impact_overall: {
    fr: "Impact global modifié",
    en: "Overall impact changed",
    ar: "تم تعديل الأثر الإجمالي",
  },
  scores: {
    fr: "Scores d’impact modifiés",
    en: "Impact scores changed",
    ar: "تم تعديل درجات الأثر",
  },
};

const EVENT_LABELS = {
  validated: {
    fr: "Enjeu validé par la revue humaine",
    en: "Issue validated by human review",
    ar: "تم اعتماد الرهان بعد المراجعة البشرية",
  },
  not_retained: { fr: "Enjeu non retenu", en: "Issue not retained", ar: "لم يُعتمد الرهان" },
  modified: {
    fr: "Analyse modifiée par un expert",
    en: "Analysis changed by an expert",
    ar: "عدّل خبير التحليل",
  },
  pending: {
    fr: "Enjeu réintégré à la revue",
    en: "Issue returned to review",
    ar: "أُعيد الرهان إلى المراجعة",
  },
  marked_priority: {
    fr: "Enjeu marqué prioritaire",
    en: "Issue marked as priority",
    ar: "تم تحديد الرهان كأولوية",
  },
  priority_removed: { fr: "Priorité retirée", en: "Priority removed", ar: "أُزيلت الأولوية" },
  detail_marked: { fr: "Marqué prioritaire", en: "Marked as priority", ar: "حُدِّد كأولوية" },
  detail_removed: {
    fr: "Retiré des priorités",
    en: "Removed from priorities",
    ar: "أُزيل من الأولويات",
  },
  decision: { fr: "Décision enregistrée", en: "Decision recorded", ar: "تم تسجيل القرار" },
} satisfies Record<string, Localized>;

export interface AuditEvent {
  id: string;
  createdAt: string;
  label: string;
  reason: string | null;
  details: string[];
}

function reviewStatusLabel(value: unknown): Localized | null {
  if (value === "validated") return EVENT_LABELS.validated;
  if (value === "not_retained") return EVENT_LABELS.not_retained;
  if (value === "modified") return EVENT_LABELS.modified;
  if (value === "pending") return EVENT_LABELS.pending;
  return null;
}

/** Groups raw corrections of one logical user action into one audit event. */
export function groupCorrections(
  corrections: ContextIssueCorrectionLike[],
  language: Language = "fr",
): AuditEvent[] {
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

    let label: Localized | null = status ? reviewStatusLabel(status.newValue) : null;
    if (!label && analysis.length > 0) {
      label = FIELD_LABELS[analysis[0]!.fieldName] ?? EVENT_LABELS.modified;
    }
    const priorityLabel = priority
      ? priority.newValue === true
        ? EVENT_LABELS.marked_priority
        : EVENT_LABELS.priority_removed
      : null;
    if (!label && priorityLabel) label = priorityLabel;

    const details: string[] = [];
    for (const item of analysis) {
      const detail = FIELD_LABELS[item.fieldName];
      if (detail && detail !== label) details.push(detail[language]);
    }
    if (priority && label !== priorityLabel) {
      details.push(
        (priority.newValue === true ? EVENT_LABELS.detail_marked : EVENT_LABELS.detail_removed)[
          language
        ],
      );
    }

    const first = bucket[0]!;
    events.push({
      id: first.id,
      createdAt: first.createdAt,
      label: (label ?? EVENT_LABELS.decision)[language],
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
