export type Decision = "pending" | "retained" | "rejected";
type Reviewed = { id: string; decision: Decision };
export interface PlanningDocument {
  directions: {
    priorities: string[];
    otherPriority: string;
    style: string | null;
    signatoryRole: string;
    signatoryName: string;
    internalNote: string;
  };
  axes: (Reviewed & { title: string; rationale: string })[];
  statement: string;
  policyVersionId: string | null;
  objectives: (Reviewed & {
    axisId: string;
    title: string;
    indicator: string;
    method: string;
    unit: string;
    baseline: string;
    target: string;
    deadline: string;
    frequency: string;
    owner: string;
  })[];
  processes: (Reviewed & {
    title: string;
    purpose: string;
    inputs: string;
    outputs: string;
    family: "management" | "realization" | "support";
    pilotName: string;
    pilotRole: string;
  })[];
  interactions: (Reviewed & { from: string; to: string; flow: string })[];
}
export function emptyDocument(): PlanningDocument {
  return {
    directions: {
      priorities: [],
      otherPriority: "",
      style: null,
      signatoryRole: "",
      signatoryName: "",
      internalNote: "",
    },
    axes: [],
    statement: "",
    policyVersionId: null,
    objectives: [],
    processes: [],
    interactions: [],
  };
}
export function directionsComplete(d: PlanningDocument) {
  const v = d.directions;
  return (
    v.priorities.length > 0 &&
    (!v.priorities.includes("other") || Boolean(v.otherPriority.trim())) &&
    Boolean(v.style && v.signatoryRole.trim() && v.signatoryName.trim())
  );
}
export function decided<T extends Reviewed>(items: T[]) {
  return (
    items.length > 0 &&
    items.every((x) => x.decision !== "pending") &&
    items.some((x) => x.decision === "retained")
  );
}
export function axesComplete(d: PlanningDocument) {
  return directionsComplete(d) && decided(d.axes);
}
export function statementComplete(d: PlanningDocument) {
  const words = d.statement.trim().split(/\s+/u).filter(Boolean).length;
  return axesComplete(d) && d.statement.trim().length >= 600 && words >= 140 && words <= 700;
}
export function objectivesComplete(d: PlanningDocument) {
  const axes = new Set(d.axes.filter((x) => x.decision === "retained").map((x) => x.id));
  return (
    Boolean(d.policyVersionId) &&
    decided(d.objectives) &&
    d.objectives
      .filter((x) => x.decision === "retained")
      .every(
        (x) =>
          axes.has(x.axisId) &&
          [x.indicator, x.method, x.target, x.deadline, x.frequency, x.owner].every((v) =>
            v.trim(),
          ) &&
          /^\d{4}-\d{2}-\d{2}$/.test(x.deadline) &&
          !Number.isNaN(Date.parse(x.deadline)) &&
          new Date(x.deadline).toISOString().slice(0, 10) === x.deadline,
      )
  );
}
export function processesComplete(d: PlanningDocument) {
  return (
    decided(d.processes) &&
    d.processes
      .filter((x) => x.decision === "retained")
      .every((x) => [x.purpose, x.inputs, x.outputs].every((v) => v.trim()))
  );
}
export function interactionsComplete(d: PlanningDocument) {
  const ps = d.processes.filter((x) => x.decision === "retained");
  const ids = new Set(ps.map((x) => x.id));
  const retained = d.interactions.filter((x) => x.decision === "retained");
  return (
    processesComplete(d) &&
    decided(d.interactions) &&
    retained.every((x) => x.from !== x.to && ids.has(x.from) && ids.has(x.to) && x.flow.trim()) &&
    ps.every((x) => retained.some((i) => i.from === x.id || i.to === x.id))
  );
}
export function pilotsComplete(d: PlanningDocument) {
  return (
    interactionsComplete(d) &&
    d.processes
      .filter((x) => x.decision === "retained")
      .every((x) => x.pilotName.trim() && x.pilotRole.trim())
  );
}
export function uniqueIds(d: PlanningDocument) {
  return [d.axes, d.objectives, d.processes, d.interactions].every(
    (xs) => new Set(xs.map((x) => x.id)).size === xs.length,
  );
}
export function policyBasis(d: PlanningDocument) {
  return {
    directions: d.directions,
    axes: d.axes.filter((x) => x.decision === "retained"),
    statement: d.statement,
  };
}
