import { describe, expect, it } from "vitest";

import { isRoTreatmentEligible, roTreatmentBlocker } from "./eligibility.js";
import {
  RO_METHODOLOGY_VERSION,
  defaultOpportunityPriority,
  defaultRiskPriority,
  opportunityBand,
  opportunityScore,
  riskBand,
  riskScore,
} from "./methodology.js";

describe("risk scoring", () => {
  it("is probabilité × impact", () => {
    expect(riskScore(4, 5)).toBe(20);
    expect(riskScore(1, 1)).toBe(1);
  });

  it("returns null when either axis is missing", () => {
    expect(riskScore(null, 5)).toBeNull();
    expect(riskScore(4, undefined)).toBeNull();
  });

  it.each([
    [1, "Faible", "P4"],
    [4, "Faible", "P4"],
    [5, "Modéré", "P3"],
    [9, "Modéré", "P3"],
    [10, "Élevé", "P2"],
    [15, "Élevé", "P2"],
    [16, "Critique", "P1"],
    [25, "Critique", "P1"],
  ])("bands a score of %i as %s / %s", (score, label, priority) => {
    expect(riskBand(score)?.label).toBe(label);
    expect(defaultRiskPriority(score)).toBe(priority);
  });
});

describe("opportunity scoring", () => {
  it("is faisabilité × bénéfice", () => {
    expect(opportunityScore(3, 4)).toBe(12);
  });

  it.each([
    [4, "Faible", "P4"],
    [9, "Intéressante", "P3"],
    [15, "Forte", "P2"],
    [25, "Stratégique", "P1"],
  ])("bands a score of %i as %s / %s", (score, label, priority) => {
    expect(opportunityBand(score)?.label).toBe(label);
    expect(defaultOpportunityPriority(score)).toBe(priority);
  });

  it("shares the priority thresholds with risks", () => {
    for (const score of [1, 4, 5, 9, 10, 15, 16, 25]) {
      expect(defaultOpportunityPriority(score)).toBe(defaultRiskPriority(score));
    }
  });
});

describe("treatment eligibility", () => {
  const eligible = {
    itemReviewStatus: "validated",
    hasEvaluation: true,
    evaluationReviewStatus: "validated",
    controlsState: "oui",
  } as const;

  it("accepts a fully reviewed item", () => {
    expect(roTreatmentBlocker(eligible)).toBeNull();
    expect(isRoTreatmentEligible(eligible)).toBe(true);
  });

  it("accepts a corrected item and a corrected rating", () => {
    expect(
      isRoTreatmentEligible({
        ...eligible,
        itemReviewStatus: "modified",
        evaluationReviewStatus: "modified",
      }),
    ).toBe(true);
  });

  it("accepts controls explicitly declared absent", () => {
    expect(isRoTreatmentEligible({ ...eligible, controlsState: "non" })).toBe(true);
  });

  it("blocks an item that is not retained, before anything else", () => {
    expect(
      roTreatmentBlocker({
        itemReviewStatus: "pending",
        hasEvaluation: false,
        evaluationReviewStatus: null,
        controlsState: null,
      }),
    ).toBe("item_not_retained");
  });

  it("blocks a retained item with no rating", () => {
    expect(roTreatmentBlocker({ ...eligible, hasEvaluation: false })).toBe("rating_missing");
  });

  it("blocks a rating that is not professionally reviewed", () => {
    expect(roTreatmentBlocker({ ...eligible, evaluationReviewStatus: "pending" })).toBe(
      "rating_pending",
    );
    expect(roTreatmentBlocker({ ...eligible, evaluationReviewStatus: "not_retained" })).toBe(
      "rating_pending",
    );
  });

  it("blocks while existing controls are undeclared", () => {
    expect(roTreatmentBlocker({ ...eligible, controlsState: "a_renseigner" })).toBe(
      "controls_undeclared",
    );
    expect(roTreatmentBlocker({ ...eligible, controlsState: null })).toBe("controls_undeclared");
  });

  it("never treats an unrecognised persisted status as reviewed", () => {
    expect(roTreatmentBlocker({ ...eligible, itemReviewStatus: "legacy_status" })).toBe(
      "item_not_retained",
    );
    expect(roTreatmentBlocker({ ...eligible, evaluationReviewStatus: "legacy_status" })).toBe(
      "rating_pending",
    );
  });

  it("pins the methodology version so historical runs stay readable", () => {
    expect(RO_METHODOLOGY_VERSION).toBe("ro-v2");
  });
});
