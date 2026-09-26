/**
 * Evaluation of the issues in the "Synthèse des enjeux" step.
 *
 * Each retained issue is rated on two 1–3 scales: its impact on the quality
 * of products/services and on customer satisfaction, and the organisation's
 * capacity to control it (capacité de maîtrise). Its qualification comes from
 * a crossed decision matrix and is always derived from the two ratings, never
 * stored, so the screen and every export always agree.
 */

import type { Language, Localized } from "../../language.js";

export type EvaluationLevel = 1 | 2 | 3;

export const EVALUATION_LEVELS: readonly EvaluationLevel[] = [1, 2, 3];

export type IssueQualification = "majeur" | "significatif" | "a_surveiller" | "mineur";

/** Display order of the qualification legend, most to least critical. */
export const ISSUE_QUALIFICATIONS: readonly IssueQualification[] = [
  "majeur",
  "significatif",
  "a_surveiller",
  "mineur",
];

/** Rows: impact (3 = high). Columns: capacité de maîtrise (3 = high). */
const DECISION_MATRIX: Record<EvaluationLevel, Record<EvaluationLevel, IssueQualification>> = {
  3: { 1: "majeur", 2: "significatif", 3: "a_surveiller" },
  2: { 1: "significatif", 2: "a_surveiller", 3: "mineur" },
  1: { 1: "a_surveiller", 2: "mineur", 3: "mineur" },
};

export function isEvaluationLevel(value: unknown): value is EvaluationLevel {
  return value === 1 || value === 2 || value === 3;
}

/** Null until both ratings are set: an unrated issue is never qualified. */
export function issueQualification(impact: unknown, mastery: unknown): IssueQualification | null {
  if (!isEvaluationLevel(impact) || !isEvaluationLevel(mastery)) return null;
  return DECISION_MATRIX[impact][mastery];
}

const QUALIFICATION_LABELS: Record<IssueQualification, Localized> = {
  majeur: { fr: "Majeur", en: "Major", ar: "رئيسي" },
  significatif: { fr: "Significatif", en: "Significant", ar: "مهم" },
  a_surveiller: { fr: "À surveiller", en: "To monitor", ar: "للمراقبة" },
  mineur: { fr: "Mineur", en: "Minor", ar: "ثانوي" },
};

export function qualificationLabel(
  qualification: IssueQualification,
  language: Language = "fr",
): string {
  return QUALIFICATION_LABELS[qualification][language];
}
