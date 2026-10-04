import { describe, it, expect } from "vitest";
import {
  emptyDocument,
  directionsComplete,
  axesComplete,
  statementComplete,
  objectivesComplete,
  processesComplete,
  interactionsComplete,
  pilotsComplete,
} from "./index.js";
const directions = {
  priorities: ["customer_satisfaction"],
  otherPriority: "",
  style: "engage",
  signatoryRole: "Director",
  signatoryName: "Reviewer",
  internalNote: "",
};
const axis = {
  id: "a",
  decision: "retained" as const,
  title: "Customer satisfaction",
  rationale: "Professional strategic quality direction",
};
const process = (id: string) => ({
  id,
  decision: "retained" as const,
  title: id,
  purpose: "Repair",
  inputs: "Order",
  outputs: "Repaired goods",
  family: "realization" as const,
  pilotName: "",
  pilotRole: "",
});
describe("Policy and process professional gates", () => {
  it("does not infer management directions from upstream evidence", () => {
    expect(directionsComplete(emptyDocument())).toBe(false);
    expect(
      directionsComplete({
        ...emptyDocument(),
        directions: { ...directions, priorities: ["other"] },
      }),
    ).toBe(false);
    expect(directionsComplete({ ...emptyDocument(), directions })).toBe(true);
  });
  it("requires all axes decisions and a bounded policy", () => {
    const d = {
      ...emptyDocument(),
      directions,
      axes: [axis, { ...axis, id: "b", decision: "pending" as const }],
    };
    expect(axesComplete(d)).toBe(false);
    expect(
      statementComplete({ ...d, axes: [axis], statement: "Quality policy. ".repeat(150) }),
    ).toBe(true);
    expect(statementComplete({ ...d, axes: [axis], statement: "Short policy" })).toBe(false);
  });
  it("requires human target, responsibility, valid date and retained axis", () => {
    const objective = {
      id: "o",
      decision: "retained" as const,
      axisId: "a",
      title: "Improve customer satisfaction",
      indicator: "Satisfaction",
      method: "Survey",
      unit: "%",
      baseline: "",
      target: "",
      deadline: "",
      frequency: "Quarterly",
      owner: "",
    };
    const d = { ...emptyDocument(), axes: [axis], policyVersionId: "v", objectives: [objective] };
    expect(objectivesComplete(d)).toBe(false);
    const complete = {
      ...objective,
      target: "95%",
      deadline: "2027-01-31",
      owner: "Service director",
    };
    expect(objectivesComplete({ ...d, objectives: [complete] })).toBe(true);
    expect(objectivesComplete({ ...d, objectives: [{ ...complete, axisId: "unknown" }] })).toBe(
      false,
    );
    expect(
      objectivesComplete({ ...d, objectives: [{ ...complete, deadline: "2027-02-31" }] }),
    ).toBe(false);
  });
  it("requires every process to have meaningful inputs and outputs", () => {
    const d = { ...emptyDocument(), processes: [process("a"), process("b")] };
    expect(processesComplete(d)).toBe(true);
    expect(processesComplete({ ...d, processes: [{ ...process("a"), outputs: "" }] })).toBe(false);
  });
  it("rejects self-links, unknown endpoints, pending reviews and uncovered processes", () => {
    const d = {
      ...emptyDocument(),
      processes: [process("a"), process("b")],
      interactions: [
        { id: "i", decision: "retained" as const, from: "a", to: "b", flow: "Order details" },
      ],
    };
    expect(interactionsComplete(d)).toBe(true);
    expect(interactionsComplete({ ...d, interactions: [{ ...d.interactions[0]!, to: "a" }] })).toBe(
      false,
    );
    expect(interactionsComplete({ ...d, processes: [...d.processes, process("c")] })).toBe(false);
    expect(
      interactionsComplete({
        ...d,
        interactions: [{ ...d.interactions[0]!, decision: "pending" }],
      }),
    ).toBe(false);
  });
  it("requires named pilots and roles for every retained process", () => {
    const d = {
      ...emptyDocument(),
      processes: [process("a"), process("b")],
      interactions: [
        { id: "i", decision: "retained" as const, from: "a", to: "b", flow: "Order details" },
      ],
    };
    expect(pilotsComplete(d)).toBe(false);
    expect(
      pilotsComplete({
        ...d,
        processes: d.processes.map((p) => ({ ...p, pilotName: "Reviewer", pilotRole: "Director" })),
      }),
    ).toBe(true);
  });
});
