/** Browser-safe completion rules, shared by the API and UI. */
type Review = "PENDING" | "VALIDATED" | "MODIFIED" | "NOT_RETAINED";
export type PipWorkflowParty = {
  reviewStatus: Review;
  requirements: {
    reviewStatus: Review;
    content: { kind: string };
    allocationReviewed: boolean;
    noServiceConfirmed: boolean;
    services: string[];
  }[];
  evaluation: {
    reviewStatus: Review;
    content: {
      power: number | null;
      interest: number | null;
      impact: number | null;
      requirementLevel: number | null;
      monitoringMethod: string;
      monitoringFrequency: string;
    };
  } | null;
};
export function isRetained(value: { reviewStatus: Review }): boolean {
  return value.reviewStatus === "VALIDATED" || value.reviewStatus === "MODIFIED";
}
export function needsAllocation(value: { content: { kind: string } }): boolean {
  return value.content.kind !== "need";
}
export function evaluationComplete(party: PipWorkflowParty, method: string): boolean {
  const evaluation = party.evaluation;
  if (!evaluation || !isRetained(evaluation)) return false;
  const c = evaluation.content;
  return (
    (method === "criticality" || (c.power != null && c.interest != null)) &&
    (method === "power_interest" || (c.impact != null && c.requirementLevel != null)) &&
    !!c.monitoringMethod.trim() &&
    !!c.monitoringFrequency.trim()
  );
}
export function computePipWorkflow(parties: PipWorkflowParty[], method = "both", outdated = false) {
  const retained = parties.filter(isRetained);
  const items = retained.flatMap((p) =>
    p.requirements.filter((r) => r.reviewStatus !== "NOT_RETAINED"),
  );
  const allocationItems = items.filter((r) => isRetained(r) && needsAllocation(r));
  const allocationDone = (r: (typeof allocationItems)[number]) =>
    r.allocationReviewed &&
    (r.noServiceConfirmed ? r.services.length === 0 : r.services.length > 0);
  const step1 = retained.length > 0 && !outdated;
  const step2 =
    step1 &&
    retained.every((p) => {
      const active = p.requirements.filter((r) => r.reviewStatus !== "NOT_RETAINED");
      return active.length > 0 && active.every(isRetained);
    });
  // A needs-only register requires no allocation; zero is an honest completed count.
  const step3 = step2 && allocationItems.every(allocationDone);
  const step4 = step3 && retained.every((p) => evaluationComplete(p, method));
  return {
    completion: [step1, step2, step3, step4, step4],
    complete: step4,
    unresolved: parties.filter((p) => p.reviewStatus === "PENDING").length,
    requirements: { reviewed: items.filter(isRetained).length, total: items.length },
    allocations: {
      reviewed: allocationItems.filter(allocationDone).length,
      total: allocationItems.length,
    },
    evaluations: {
      reviewed: retained.filter((p) => evaluationComplete(p, method)).length,
      total: retained.length,
    },
  };
}

/** PIP identity preserves short names (RH, IT) and word order, unlike issue keys. */
export function canonicalPipKey(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/\u0640/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
