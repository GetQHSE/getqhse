import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

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

describe("accuracy-first regulatory review gates", () => {
  const tenant = { organizationId: "org-1", userId: "reviewer-1", role: "owner" };

  function serviceWithLoadedWatch(candidate: Record<string, unknown>) {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    const service = new RegulatoryWatchService({} as never);
    (service as unknown as { loadedWatch(): Promise<unknown> }).loadedWatch = async () => ({
      id: "watch-1",
      revision: 3,
    });
    const candidateUpdate = vi.fn().mockResolvedValue({});
    const transactionClient = {
      projectRegulatoryWatch: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      regulatoryApplicabilityCandidate: { update: candidateUpdate },
    };
    (service as unknown as { database: object }).database = {
      regulatoryApplicabilityCandidate: { findFirst: vi.fn().mockResolvedValue(candidate) },
      $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient),
      ),
    };
    (service as unknown as { get(): Promise<unknown> }).get = async () => ({ id: "watch-1" });
    return { service, candidateUpdate };
  }

  it("blocks reviewer decisions when source quality must be repaired", async () => {
    const { service } = serviceWithLoadedWatch({
      id: "candidate-1",
      requirementStatus: "SOURCE_REVIEW_REQUIRED",
      requirementText: null,
    });
    await expect(
      service.decideCandidate(tenant, "project-1", "candidate-1", {
        watchRevision: 3,
        decision: "NOT_APPLICABLE",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("records edited AI wording as human-approved provenance", async () => {
    const { service, candidateUpdate } = serviceWithLoadedWatch({
      id: "candidate-1",
      requirementStatus: "READY",
      requirementText:
        "Version proposée par l’IA avec une formulation initiale suffisamment longue.",
    });
    await service.decideCandidate(tenant, "project-1", "candidate-1", {
      watchRevision: 3,
      decision: "APPLICABLE",
      requirementText:
        "Version corrigée et approuvée par le responsable réglementaire de l’organisation.",
    });
    expect(candidateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requirementSource: "HUMAN",
          requirementEditedById: "reviewer-1",
          requirementStatus: "READY",
        }),
      }),
    );
  });

  it("blocks publication when any candidate has unresolved source quality", async () => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    const service = new RegulatoryWatchService({} as never);
    (service as unknown as { loadedWatch(): Promise<unknown> }).loadedWatch = async () => ({
      id: "watch-1",
      revision: 3,
    });
    (service as unknown as { database: object }).database = {
      regulatoryAnalysisRun: {
        findFirst: vi.fn().mockResolvedValue({
          id: "run-1",
          candidates: [{ requirementStatus: "SOURCE_REVIEW_REQUIRED" }],
        }),
      },
    };
    await expect(
      service.publish(tenant, "project-1", {
        analysisRunId: "run-1",
        watchRevision: 3,
      }),
    ).rejects.toThrow("Publication is blocked");
  });

  it("supersedes an unpublished ready run during an explicit rerun", async () => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    const enqueue = vi.fn().mockResolvedValue({ jobId: "job-2" });
    const service = new RegulatoryWatchService({ enqueue } as never);
    (service as unknown as { ensureWatch(): Promise<unknown> }).ensureWatch = async () => ({
      project: {
        profile: {
          status: "COMPLETE",
          snapshots: [{ id: "snapshot-2" }],
        },
      },
      watch: {
        id: "watch-1",
        currentBaselineId: null,
        analyses: [{ id: "run-1", status: "READY_FOR_REVIEW" }],
      },
    });
    const supersede = vi.fn().mockResolvedValue({});
    const transactionClient = {
      regulatoryAnalysisRun: {
        update: supersede,
        create: vi.fn().mockResolvedValue({ id: "run-2", status: "QUEUED" }),
      },
      projectRegulatoryWatch: { update: vi.fn().mockResolvedValue({}) },
    };
    (service as unknown as { database: object }).database = {
      $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient),
      ),
    };

    await service.startAnalysis(tenant, "project-1", { languages: ["fr", "ar"] });
    expect(supersede).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({ status: "SUPERSEDED" }),
      }),
    );
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it("refuses XLSX export for a legacy baseline without approved requirement text", async () => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    const service = new RegulatoryWatchService({} as never);
    (service as unknown as { loadedWatch(): Promise<unknown> }).loadedWatch = async () => ({
      currentBaseline: {
        entries: [
          {
            requirementText: null,
            provision: { version: { exportAllowed: true } },
          },
        ],
      },
    });

    await expect(service.exportWorkbook(tenant, "project-1")).rejects.toThrow(
      "Exigence à régénérer",
    );
  });
});
