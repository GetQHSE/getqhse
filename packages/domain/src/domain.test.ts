import { describe, expect, it } from "vitest";

import {
  assertAuditTransition,
  calculateComplianceScore,
  calculateCorrectiveActionDeadline,
  classifyFindingSeverity,
  isRequirementApplicable,
} from "./index.js";

describe("compliance scoring", () => {
  it("excludes non-applicable and unassessed requirements", () => {
    const score = calculateComplianceScore([
      { requirementId: "1", applicable: true, result: "CONFORMING" },
      { requirementId: "2", applicable: true, result: "PARTIAL" },
      { requirementId: "3", applicable: false, result: "NON_CONFORMING" },
      { requirementId: "4", applicable: true, result: "NOT_ASSESSED" },
    ]);
    expect(score).toEqual({
      score: 75,
      earnedWeight: 1.5,
      possibleWeight: 2,
      assessedCount: 2,
    });
  });

  it("returns null when there is no assessable requirement", () => {
    expect(
      calculateComplianceScore([{ requirementId: "1", applicable: false, result: "CONFORMING" }])
        .score,
    ).toBeNull();
  });
});

describe("audit workflow", () => {
  it("allows review to return to active work", () => {
    expect(() => assertAuditTransition("IN_REVIEW", "IN_PROGRESS")).not.toThrow();
  });

  it("prevents reopening completed audits", () => {
    expect(() => assertAuditTransition("COMPLETED", "IN_PROGRESS")).toThrow(
      "Invalid audit status transition",
    );
  });
});

describe("representative rules", () => {
  it("determines applicability from site activities", () => {
    expect(isRequirementApplicable(["welding"], { activities: ["welding", "storage"] })).toBe(true);
  });

  it("prioritizes immediate danger", () => {
    expect(
      classifyFindingSeverity({
        legalBreach: false,
        immediateDanger: true,
        systemicFailure: false,
        isolatedFailure: false,
      }),
    ).toBe("CRITICAL");
  });

  it("gives major findings fourteen days", () => {
    expect(
      calculateCorrectiveActionDeadline("MAJOR", new Date("2026-01-01T00:00:00Z")).toISOString(),
    ).toBe("2026-01-15T00:00:00.000Z");
  });
});
