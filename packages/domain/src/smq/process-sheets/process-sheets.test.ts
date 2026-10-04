import { describe, it, expect } from "vitest";
import { emptyContent, missingItems, relatedInteractions } from "./index.js";
const base = () =>
  emptyContent(
    { purpose: "Repair orders", inputs: "Customer orders", outputs: "Repaired products" },
    "2026-10-04",
  );
const refs = { objectives: [{ id: "o" }], risks: [{ id: "r" }], requirements: [{ id: "q" }] };
const complete = () => ({
  ...base(),
  description: "Receive, repair, check and return customer goods.",
  authorName: "Reviewer",
  approverName: "Director",
  referencesReviewed: true,
  activities: [
    {
      id: "a",
      activity: "Check completed repairs",
      input: "Repaired goods",
      output: "Verified goods",
      decision: "retained" as const,
    },
  ],
});
describe("Process sheet professional review", () => {
  it("seeds identity fields without inventing activities, approval or references", () => {
    const c = base();
    expect(c.activities).toEqual([]);
    expect(c.authorName).toBe("");
    expect(c.approverName).toBe("");
    expect(c.riskIds).toEqual([]);
    expect(missingItems(c, refs)).toContain("referencesReviewed");
  });
  it("requires every generated activity to be decided with meaningful retained fields", () => {
    const c = complete();
    expect(missingItems(c, refs)).toEqual([]);
    expect(
      missingItems({ ...c, activities: [{ ...c.activities[0]!, decision: "pending" }] }, refs),
    ).toContain("activitiesReview");
    expect(
      missingItems({ ...c, activities: [{ ...c.activities[0]!, output: "" }] }, refs),
    ).toContain("activitiesFields");
  });
  it("rejects unknown objectives, risks and PIP requirements", () => {
    const c = {
      ...complete(),
      riskIds: ["unknown"],
      requirementIds: ["unknown"],
      kpiLinks: [
        {
          id: "k",
          objectiveId: "unknown",
          strategicLabel: "Fake validated objective",
          operational: "Reduce delays",
          kpi: "Days",
        },
      ],
    };
    expect(missingItems(c, refs)).toEqual(
      expect.arrayContaining(["riskIds", "requirementIds", "kpiLinks"]),
    );
  });
  it("accepts an explicit manual objective link without inventing a target", () =>
    expect(
      missingItems(
        {
          ...complete(),
          kpiLinks: [
            {
              id: "k",
              objectiveId: null,
              strategicLabel: "Operational quality",
              operational: "Reduce repair errors",
              kpi: "Repair rework rate",
            },
          ],
        },
        refs,
      ),
    ).toEqual([]));
  it("rejects impossible dates and duplicate activity identifiers", () => {
    const c = complete();
    expect(missingItems({ ...c, date: "2026-02-31" }, refs)).toContain("date");
    expect(missingItems({ ...c, activities: [...c.activities, ...c.activities] }, refs)).toContain(
      "duplicateIds",
    );
  });
  it("shows only interactions involving the selected process", () =>
    expect(
      relatedInteractions(
        [
          { from: "a", to: "b" },
          { from: "b", to: "c" },
          { from: "d", to: "e" },
        ],
        "b",
      ),
    ).toHaveLength(2));
});
