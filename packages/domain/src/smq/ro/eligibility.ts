/**
 * The ONE definition of "this risk/opportunity may enter treatment generation".
 *
 * Shared by the workflow computation used in the UI and by the server-side
 * treatment pipeline so the two can never drift. Purely a read predicate: it
 * never writes and never changes an existing decision, rating or control.
 *
 * An item is eligible only when the professional work upstream is complete:
 *   1. the item itself is retained (validated or modified);
 *   2. an initial evaluation (cotation) exists;
 *   3. that evaluation is professionally reviewed (validated or modified) —
 *      a pending or not-retained cotation is never treated;
 *   4. existing controls are explicitly declared ("oui" or "non").
 */

/** The review vocabulary of the module. */
export type RoEligibilityReview = "pending" | "validated" | "modified" | "not_retained";

/**
 * Review statuses are read as plain strings: a persisted row may carry a value
 * outside the current vocabulary (a legacy run, a future revision), and an
 * unrecognised value is never treated as reviewed.
 */
export interface RoTreatmentEligibilityInput {
  /** Review status of the item itself. */
  itemReviewStatus: string | null | undefined;
  /** True when an initial evaluation row exists for the item. */
  hasEvaluation: boolean;
  /** Review status of the initial evaluation, null when there is none. */
  evaluationReviewStatus: string | null | undefined;
  /** Declared controls state: "a_renseigner" | "oui" | "non". */
  controlsState: string | null | undefined;
}

export type RoTreatmentBlocker =
  "item_not_retained" | "rating_missing" | "rating_pending" | "controls_undeclared";

const REVIEWED = new Set(["validated", "modified"]);

/** Returns the first blocking reason, or null when the item is eligible. */
export function roTreatmentBlocker(input: RoTreatmentEligibilityInput): RoTreatmentBlocker | null {
  if (!REVIEWED.has(String(input.itemReviewStatus))) return "item_not_retained";
  if (!input.hasEvaluation) return "rating_missing";
  if (!REVIEWED.has(String(input.evaluationReviewStatus))) return "rating_pending";
  if (input.controlsState !== "oui" && input.controlsState !== "non") {
    return "controls_undeclared";
  }
  return null;
}

export function isRoTreatmentEligible(input: RoTreatmentEligibilityInput): boolean {
  return roTreatmentBlocker(input) === null;
}

/** Short French label shown next to a blocked item in steps 4 and 5. */
export function roTreatmentBlockerLabel(blocker: RoTreatmentBlocker): string {
  switch (blocker) {
    case "item_not_retained":
      return "À examiner";
    case "rating_missing":
      return "Cotation à réaliser";
    case "rating_pending":
      return "Cotation à valider";
    case "controls_undeclared":
      return "Maîtrises existantes à déclarer";
  }
}
