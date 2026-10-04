type Activity = {
  id: string;
  activity: string;
  input: string;
  output: string;
  decision: "pending" | "retained" | "rejected";
};
export interface Content {
  purpose: string;
  description: string;
  inputs: string;
  outputs: string;
  authorName: string;
  approverName: string;
  date: string;
  activities: Activity[];
  kpiLinks: {
    id: string;
    objectiveId: string | null;
    strategicLabel: string;
    operational: string;
    kpi: string;
  }[];
  riskIds: string[];
  requirementIds: string[];
  referencesReviewed: boolean;
  notes: string;
}
export function emptyContent(
  process: { purpose: string; inputs: string; outputs: string },
  date: string,
): Content {
  return {
    purpose: process.purpose,
    description: "",
    inputs: process.inputs,
    outputs: process.outputs,
    authorName: "",
    approverName: "",
    date,
    activities: [],
    kpiLinks: [],
    riskIds: [],
    requirementIds: [],
    referencesReviewed: false,
    notes: "",
  };
}
export function missingItems(
  c: Content,
  refs: { objectives: { id: string }[]; risks: { id: string }[]; requirements: { id: string }[] },
) {
  const missing: string[] = [];
  for (const k of [
    "purpose",
    "description",
    "inputs",
    "outputs",
    "authorName",
    "approverName",
  ] as const)
    if (!c[k].trim()) missing.push(k);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(c.date) ||
    Number.isNaN(Date.parse(c.date)) ||
    new Date(c.date).toISOString().slice(0, 10) !== c.date
  )
    missing.push("date");
  if (
    !c.activities.some((a) => a.decision === "retained") ||
    c.activities.some((a) => a.decision === "pending")
  )
    missing.push("activitiesReview");
  if (
    c.activities
      .filter((a) => a.decision === "retained")
      .some((a) => ![a.activity, a.input, a.output].every((x) => x.trim()))
  )
    missing.push("activitiesFields");
  const ids = new Set(refs.objectives.map((x) => x.id));
  if (
    c.kpiLinks.some(
      (k) =>
        !(k.objectiveId ? ids.has(k.objectiveId) : k.strategicLabel.trim()) ||
        !k.operational.trim() ||
        !k.kpi.trim(),
    )
  )
    missing.push("kpiLinks");
  if (c.riskIds.some((id) => !refs.risks.some((r) => r.id === id))) missing.push("riskIds");
  if (c.requirementIds.some((id) => !refs.requirements.some((r) => r.id === id)))
    missing.push("requirementIds");
  if (!c.referencesReviewed) missing.push("referencesReviewed");
  if ([c.activities, c.kpiLinks].some((xs) => new Set(xs.map((x) => x.id)).size !== xs.length))
    missing.push("duplicateIds");
  return missing;
}
export function relatedInteractions<T extends { from: string; to: string }>(
  items: T[],
  processId: string,
) {
  return items.filter((i) => i.from === processId || i.to === processId);
}
