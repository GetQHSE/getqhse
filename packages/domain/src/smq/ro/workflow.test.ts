import { roRegisterRows } from "./register.js";
import { describe, expect, it } from "vitest";
import {
  computeRoWorkflow,
  roScore,
  roTreatmentEligible,
  roOverdue,
  type WorkflowItem,
} from "./workflow.js";
const item = (): WorkflowItem => ({
  reviewStatus: "VALIDATED",
  effective: {
    content: { type: "risk" },
    rating: { probability: 2, impact: 3, feasibility: null, benefit: null, priority: "P3" },
    ratingReviewed: true,
    controlsState: "existing",
    controls: ["Quality check"],
    controlsReviewed: true,
  },
  actions: [],
});
describe("Six-step R&O workflow", () => {
  it("completes covered items without inventing an action", () => {
    expect(computeRoWorkflow([item()]).complete).toBe(true);
    expect(roTreatmentEligible(item())).toBe(false);
  });
  it("requires actions only on items without controls", () => {
    const i = item();
    i.effective.controlsState = "none";
    i.effective.controls = [];
    expect(roTreatmentEligible(i)).toBe(true);
    expect(computeRoWorkflow([i]).complete).toBe(false);
    i.actions = [
      { reviewStatus: "VALIDATED", content: { plannedDate: "2026-10-01" }, progress: null },
    ];
    expect(computeRoWorkflow([i]).complete).toBe(true);
  });
  it("does not confuse proposals with reviewed scores", () => {
    const i = item();
    i.effective.ratingReviewed = false;
    expect(computeRoWorkflow([i]).completion).toEqual([true, true, false, false, false, false]);
    expect(roTreatmentEligible(i)).toBe(false);
  });
  it("requires a decision for every proposal", () => {
    const pending = item();
    pending.reviewStatus = "PENDING";
    expect(computeRoWorkflow([item(), pending]).completion[1]).toBe(false);
  });
  it("ignores rejected proposals in downstream steps", () => {
    const rejected = item();
    rejected.reviewStatus = "NOT_RETAINED";
    expect(computeRoWorkflow([item(), rejected]).complete).toBe(true);
  });
  it("requires evidence when controls are declared existing", () => {
    const i = item();
    i.effective.controls = [];
    expect(computeRoWorkflow([i]).completion[3]).toBe(false);
  });
  it("uses feasibility and benefit for opportunities", () => {
    const i = item();
    i.effective.content.type = "opportunity";
    expect(computeRoWorkflow([i]).completion[2]).toBe(false);
    i.effective.rating = {
      probability: null,
      impact: null,
      feasibility: 4,
      benefit: 5,
      priority: "P1",
    };
    expect(roScore(i)).toBe(20);
    expect(computeRoWorkflow([i]).complete).toBe(true);
  });
  it("blocks stale register publication", () => {
    expect(computeRoWorkflow([item()], true).complete).toBe(false);
  });
  it("derives overdue from date and execution state", () => {
    const a = {
      reviewStatus: "VALIDATED" as const,
      content: { plannedDate: "2026-09-01" },
      progress: null,
    };
    expect(roOverdue(a, "2026-09-30")).toBe(true);
    expect(roOverdue({ ...a, progress: { status: "completed" } }, "2026-09-30")).toBe(false);
  });
});

it("exports the full PIP requirement and retains covered items without fake actions", () => {
  const i = {
    ...item(),
    source: {
      branch: "pip_requirement" as const,
      title: "Requirement summary",
      description: "Full requirement ".repeat(30),
      partyName: "Customers",
    },
    effective: {
      ...item().effective,
      content: { type: "risk" as const, title: "Quality failure" },
    },
    actions: [],
  };
  const row = roRegisterRows([i], "en")[0];
  expect(row?.[1]).toBe(i.source.description);
  expect(row?.[8]).toBe("—");
  expect(row).toHaveLength(23);
});
