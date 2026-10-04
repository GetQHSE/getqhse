import { describe, it, expect } from "vitest";
import { planningMaterialSchema } from "@qhse/contracts";
import { smqPlanning } from "@qhse/domain";
import { validatePlanningProposal } from "./planning.processor.js";
const facts = {
  projectName: "Atlas",
  organizationName: "Group",
  language: "en",
  standard: "ISO_9001",
  projectActivities: [],
  profile: [],
  issues: [],
  parties: [],
  requirements: [],
  risks: [],
};
const proposal = { axes: [], statement: "", objectives: [], processes: [], interactions: [] };
const material = planningMaterialSchema.parse({
  module: "policy",
  stage: "objectives",
  sources: { facts, scope: null },
  document: {
    ...smqPlanning.emptyDocument(),
    axes: [
      {
        id: "a",
        decision: "retained",
        title: "Quality of service",
        rationale: "A professional quality orientation",
      },
    ],
  },
  fingerprint: "fp",
});
describe("Planning structured generation", () => {
  it("requires existing retained axis IDs", () => {
    const o = {
      axisId: "unknown",
      title: "Improve service quality",
      indicator: "Quality rate",
      method: "Review",
      unit: "%",
      frequency: "Monthly",
    };
    expect(() =>
      validatePlanningProposal(material, { ...proposal, objectives: [o, o, o] }),
    ).toThrow("PLANNING_PROPOSAL_INVALID");
  });
  it("removes fabricated targets, baselines, dates and owners from proposal output", () => {
    const o = {
      axisId: "a",
      title: "Improve service quality",
      indicator: "Quality rate",
      method: "Review",
      unit: "%",
      frequency: "Monthly",
      target: "100%",
      baseline: "90%",
      deadline: "2027-01-01",
      owner: "Invented person",
    };
    const out = validatePlanningProposal(material, { ...proposal, objectives: [o, o, o] });
    expect(out.objectives[0]).not.toHaveProperty("target");
    expect(out.objectives[0]).not.toHaveProperty("owner");
  });
  it("rejects interactions without full process coverage", () => {
    const process = (id: string) => ({
      id,
      title: "Repair service",
      purpose: "Repair",
      inputs: "Orders",
      outputs: "Repairs",
      family: "realization",
      decision: "retained",
      pilotName: "",
      pilotRole: "",
    });
    const m = planningMaterialSchema.parse({
      ...material,
      module: "processes",
      stage: "interactions",
      document: { ...material.document, processes: [process("a"), process("b"), process("c")] },
    });
    expect(() =>
      validatePlanningProposal(m, {
        ...proposal,
        interactions: [{ from: "a", to: "b", flow: "Repair order" }],
      }),
    ).toThrow("PLANNING_PROPOSAL_INVALID");
  });
});
