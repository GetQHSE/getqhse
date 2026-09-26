/**
 * Which issues the "Synthèse des enjeux" evaluation covers. Shared by the
 * evaluation table and the exported documents so both always list the same rows.
 */
import type { ContextIssue } from "@qhse/contracts";

/** Every issue not set aside, internal issues first (as in the template). */
export function evaluatedIssues(issues: ContextIssue[]): ContextIssue[] {
  const kept = issues.filter((issue) => issue.reviewStatus !== "NOT_RETAINED");
  return [
    ...kept.filter((issue) => issue.origin === "INTERNAL"),
    ...kept.filter((issue) => issue.origin !== "INTERNAL"),
  ];
}
