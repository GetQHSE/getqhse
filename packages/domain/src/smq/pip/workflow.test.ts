import { describe, expect, it } from "vitest";
import { computePipWorkflow, type PipWorkflowParty } from "./workflow.js";
import { pipRegisterRows } from "./register.js";
const evaluation = {
  reviewStatus: "VALIDATED" as const,
  content: {
    power: 3,
    interest: 5,
    impact: 2,
    requirementLevel: 3,
    monitoringMethod: "Enquête",
    monitoringFrequency: "Mensuelle",
  },
};
const item = {
  reviewStatus: "VALIDATED" as const,
  content: { kind: "qms_requirement" },
  services: ["Qualité"],
  allocationReviewed: true,
  noServiceConfirmed: false,
};
const party = (): PipWorkflowParty => ({
  reviewStatus: "VALIDATED",
  requirements: [{ ...item }],
  evaluation: structuredClone(evaluation),
});
describe("PIP completion", () => {
  it("does not infer validation from AI proposals", () => {
    const p = party();
    p.reviewStatus = "PENDING";
    expect(computePipWorkflow([p]).completion).toEqual([false, false, false, false, false]);
  });
  it("keeps unresolved discovery outside a completed retained register", () => {
    const unresolved = party();
    unresolved.reviewStatus = "PENDING";
    expect(computePipWorkflow([party(), unresolved])).toMatchObject({
      complete: true,
      unresolved: 1,
    });
  });
  it("requires reviewed items for every retained party", () => {
    const empty = party();
    empty.requirements = [];
    expect(computePipWorkflow([party(), empty]).completion[1]).toBe(false);
  });
  it("does not treat AI service suggestions as reviewed", () => {
    const p = party();
    p.requirements[0]!.allocationReviewed = false;
    expect(computePipWorkflow([p]).completion).toEqual([true, true, false, false, false]);
  });
  it("accepts explicit no-function decisions and rejects contradictory allocations", () => {
    const p = party();
    p.requirements[0]!.services = [];
    p.requirements[0]!.noServiceConfirmed = true;
    expect(computePipWorkflow([p]).complete).toBe(true);
    p.requirements[0]!.services = ["RH"];
    expect(computePipWorkflow([p]).complete).toBe(false);
  });
  it("supports needs-only registers without fake service markers", () => {
    const p = party();
    p.requirements[0]!.content.kind = "need";
    p.requirements[0]!.allocationReviewed = false;
    expect(computePipWorkflow([p])).toMatchObject({
      complete: true,
      allocations: { total: 0, reviewed: 0 },
    });
  });
  it("requires only the selected scores, but always a monitoring decision", () => {
    const p = party();
    p.evaluation!.content.impact = null;
    p.evaluation!.content.requirementLevel = null;
    expect(computePipWorkflow([p], "power_interest").complete).toBe(true);
    expect(computePipWorkflow([p], "both").complete).toBe(false);
    p.evaluation!.content.monitoringFrequency = "";
    expect(computePipWorkflow([p], "power_interest").complete).toBe(false);
  });
  it("blocks stale registers even if every row was reviewed", () => {
    expect(computePipWorkflow([party()], "both", true).complete).toBe(false);
  });
});

it("keeps recommendation provenance visible in the final register and exports", () => {
  const p = {
    ...party(),
    content: { name: "Customers", category: "Customers", scope: "external" },
    requirements: [
      {
        ...item,
        content: {
          kind: "qms_requirement",
          text: "Check repair quality",
          sourceType: "ai_recommendation" as const,
          sourceLabel: null,
          sourceUrl: null,
        },
      },
    ],
  };
  expect(pipRegisterRows([p], "both", "en")[0]?.[13]).toBe("GetQhse AI recommendation");
});
