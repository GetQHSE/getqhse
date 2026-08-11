import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { evaluationCarryForward, RegulatoryWatchService } from "./regulatory-watch.service.js";

describe("RegulatoryWatchService authorization", () => {
  it("rejects applicability approval by regular members before touching persistence", async () => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    const service = new RegulatoryWatchService({} as never);
    await expect(
      service.decideCandidate(
        { organizationId: "org-1", userId: "user-1", role: "member" },
        "project-1",
        "candidate-1",
        { watchRevision: 1, decision: "APPLICABLE" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("regulatory baseline carry-forward", () => {
  const previous = {
    id: "evaluation-1",
    result: "CONFORMING" as const,
    comment: "Contrôle validé",
    revision: 4,
    evaluatedById: "reviewer-1",
    evaluatedAt: new Date("2026-08-10T12:00:00.000Z"),
  };

  it("preserves the complete conformity decision for unchanged provisions", () => {
    expect(evaluationCarryForward("UNCHANGED", previous)).toEqual({
      carryContext: true,
      data: {
        previousEvaluationId: "evaluation-1",
        requiresReevaluation: false,
        result: "CONFORMING",
        comment: "Contrôle validé",
        revision: 4,
        evaluatedById: "reviewer-1",
        evaluatedAt: previous.evaluatedAt,
      },
    });
  });

  it("retains inherited context but resets conformity for modified provisions", () => {
    expect(evaluationCarryForward("MODIFIED", previous)).toEqual({
      carryContext: true,
      data: {
        previousEvaluationId: "evaluation-1",
        requiresReevaluation: true,
        result: "NOT_ASSESSED",
        comment: null,
        revision: 1,
        evaluatedById: null,
        evaluatedAt: null,
      },
    });
  });

  it("starts additions with an empty evaluation", () => {
    expect(evaluationCarryForward("ADDED", null)).toMatchObject({
      carryContext: false,
      data: { previousEvaluationId: null, result: "NOT_ASSESSED" },
    });
  });
});
