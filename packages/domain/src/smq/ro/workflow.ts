import { isRoTreatmentEligible } from "./eligibility.js";
/** Six-step workflow, shared by the browser, API and worker. */
type Review = "PENDING" | "VALIDATED" | "MODIFIED" | "NOT_RETAINED";
export const isRetainedRo = (v: { reviewStatus: Review }) =>
  v.reviewStatus === "VALIDATED" || v.reviewStatus === "MODIFIED";
export type WorkflowAction = {
  reviewStatus: Review;
  content: { plannedDate: string };
  progress: { status: string } | null;
};
export type WorkflowItem = {
  reviewStatus: Review;
  effective: {
    content: { type: string };
    rating: {
      probability: number | null;
      impact: number | null;
      feasibility: number | null;
      benefit: number | null;
      priority: string;
    } | null;
    ratingReviewed: boolean;
    controlsState: string;
    controls: string[];
    controlsReviewed: boolean;
  };
  actions: WorkflowAction[];
};
export function validRoRating(type: string, r: WorkflowItem["effective"]["rating"]) {
  const score = (v: number | null) => v !== null && Number.isInteger(v) && v >= 1 && v <= 5;
  return (
    !!r &&
    (type === "risk"
      ? score(r.probability) && score(r.impact) && r.feasibility === null && r.benefit === null
      : score(r.feasibility) && score(r.benefit) && r.probability === null && r.impact === null)
  );
}
export function roScore(item: WorkflowItem) {
  const r = item.effective.rating;
  return !r
    ? null
    : item.effective.content.type === "risk"
      ? r.probability !== null && r.impact !== null
        ? r.probability * r.impact
        : null
      : r.feasibility !== null && r.benefit !== null
        ? r.feasibility * r.benefit
        : null;
}
export function roTreatmentEligible(item: WorkflowItem) {
  return (
    item.effective.controlsReviewed &&
    validRoRating(item.effective.content.type, item.effective.rating) &&
    isRoTreatmentEligible({
      itemReviewStatus: item.reviewStatus.toLowerCase(),
      hasEvaluation: item.effective.rating !== null,
      evaluationReviewStatus: item.effective.ratingReviewed ? "validated" : "pending",
      controlsState:
        item.effective.controlsState === "none"
          ? "non"
          : item.effective.controlsState === "existing"
            ? "oui"
            : "a_renseigner",
    })
  );
}
export function roOverdue(action: WorkflowAction, today: string) {
  return (
    action.content.plannedDate < today &&
    !["completed", "cancelled"].includes(action.progress?.status ?? "todo")
  );
}
export function computeRoWorkflow(items: WorkflowItem[], outdated = false) {
  const retained = items.filter(isRetainedRo);
  const s1 = items.length > 0 && !outdated;
  const s2 = s1 && retained.length > 0 && items.every((i) => i.reviewStatus !== "PENDING");
  const s3 =
    s2 &&
    retained.every(
      (i) =>
        i.effective.ratingReviewed && validRoRating(i.effective.content.type, i.effective.rating),
    );
  const s4 =
    s3 &&
    retained.every(
      (i) =>
        i.effective.controlsReviewed &&
        (i.effective.controlsState === "none" ||
          (i.effective.controlsState === "existing" && i.effective.controls.length > 0)),
    );
  const needs = retained.filter((i) => i.effective.controlsState === "none");
  const s5 =
    s4 &&
    needs.every(
      (i) => i.actions.some(isRetainedRo) && i.actions.every((a) => a.reviewStatus !== "PENDING"),
    );
  return {
    completion: [s1, s2, s3, s4, s5, s5],
    complete: s5,
    retained: retained.length,
    unresolved: items.filter((i) => i.reviewStatus === "PENDING").length,
    actionsNeeded: needs.length,
  };
}
