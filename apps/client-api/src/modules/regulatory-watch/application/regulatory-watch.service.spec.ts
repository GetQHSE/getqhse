import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("AI-assisted conformity evaluation", () => {
  const tenant = { organizationId: "org-1", userId: "reviewer-1", role: "owner" };

  it("resets pending recommendations and enqueues a baseline evaluation", async () => {
    const assertWorkerAvailable = vi.fn().mockResolvedValue(undefined);
    const enqueue = vi.fn().mockResolvedValue({
      jobId: "job-1",
      queue: "regulatory-evaluation",
      correlationId: "correlation-1",
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const service = new RegulatoryWatchService({ assertWorkerAvailable, enqueue } as never);
    (service as unknown as { loadedWatch(): Promise<unknown> }).loadedWatch = async () => ({
      currentBaselineId: "baseline-1",
    });
    (service as unknown as { database: object }).database = {
      regulatoryEvaluation: { updateMany },
    };

    await service.startEvaluation(tenant, "project-1");

    expect(assertWorkerAvailable).toHaveBeenCalledWith("regulatory-evaluation");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ evaluatedAt: null }),
        data: expect.objectContaining({ aiStatus: "PENDING", aiSuggestedResult: null }),
      }),
    );
    expect(enqueue).toHaveBeenCalledWith(
      "regulatory-evaluation",
      "evaluate-regulatory-baseline",
      expect.objectContaining({ payload: { baselineId: "baseline-1" } }),
    );
  });

  it("never resets a completed recommendation when the baseline is re-run", async () => {
    const assertWorkerAvailable = vi.fn().mockResolvedValue(undefined);
    const enqueue = vi.fn().mockResolvedValue({
      jobId: "job-1",
      queue: "regulatory-evaluation",
      correlationId: "correlation-1",
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = new RegulatoryWatchService({ assertWorkerAvailable, enqueue } as never);
    (service as unknown as { loadedWatch(): Promise<unknown> }).loadedWatch = async () => ({
      currentBaselineId: "baseline-1",
    });
    (service as unknown as { database: object }).database = {
      regulatoryEvaluation: { updateMany },
    };

    await service.startEvaluation(tenant, "project-1");

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { aiStatus: { in: ["PENDING", "FAILED"] } },
            { aiStatus: "RUNNING", updatedAt: { lt: expect.any(Date) } },
          ],
        }),
      }),
    );
  });

  it("only fails what it just reset when the evaluation queue is unavailable", async () => {
    const assertWorkerAvailable = vi.fn().mockResolvedValue(undefined);
    const enqueue = vi.fn().mockRejectedValue(new Error("Evaluation worker is unavailable"));
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = new RegulatoryWatchService({ assertWorkerAvailable, enqueue } as never);
    (service as unknown as { loadedWatch(): Promise<unknown> }).loadedWatch = async () => ({
      currentBaselineId: "baseline-1",
    });
    (service as unknown as { database: object }).database = {
      regulatoryEvaluation: { updateMany },
    };

    await expect(service.startEvaluation(tenant, "project-1")).rejects.toThrow(
      "Evaluation worker is unavailable",
    );

    expect(updateMany).toHaveBeenLastCalledWith({
      where: {
        entry: { baselineId: "baseline-1" },
        evaluatedAt: null,
        aiStatus: "PENDING",
      },
      data: { aiStatus: "FAILED", aiErrorMessage: "Evaluation worker is unavailable" },
    });
  });

  it("records the human decision without recreating the action the pass already made", async () => {
    const actionCreate = vi.fn().mockResolvedValue({});
    const evaluationUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = new RegulatoryWatchService({} as never);
    (service as unknown as { currentEvaluation(): Promise<unknown> }).currentEvaluation =
      async () => ({ id: "evaluation-1" });
    (service as unknown as { get(): Promise<unknown> }).get = async () => ({ id: "watch-1" });
    (service as unknown as { database: object }).database = {
      regulatoryEvaluation: { updateMany: evaluationUpdateMany },
      regulatoryEvaluationAction: { count: vi.fn().mockResolvedValue(1), create: actionCreate },
    };

    await service.updateEvaluation(tenant, "project-1", "evaluation-1", {
      revision: 2,
      result: "NON_CONFORMING",
      comment: "Écart confirmé",
    });

    expect(evaluationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evaluation-1", revision: 2 },
        data: expect.objectContaining({
          result: "NON_CONFORMING",
          evaluatedById: "reviewer-1",
        }),
      }),
    );
    expect(actionCreate).not.toHaveBeenCalled();
  });
});

describe("accuracy-first regulatory review gates", () => {
  const tenant = { organizationId: "org-1", userId: "reviewer-1", role: "owner" };
  const previousRagFlag = process.env["NORMATIVE_RAG_ENABLED"];
  const previousApiKey = process.env["OPENAI_API_KEY"];

  beforeEach(() => {
    process.env["NORMATIVE_RAG_ENABLED"] = "true";
    process.env["OPENAI_API_KEY"] = "sk-test";
  });

  afterEach(() => {
    if (previousRagFlag === undefined) delete process.env["NORMATIVE_RAG_ENABLED"];
    else process.env["NORMATIVE_RAG_ENABLED"] = previousRagFlag;
    if (previousApiKey === undefined) delete process.env["OPENAI_API_KEY"];
    else process.env["OPENAI_API_KEY"] = previousApiKey;
  });

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

  it("allows deciding a candidate even when its source quality must still be repaired", async () => {
    const { service, candidateUpdate } = serviceWithLoadedWatch({
      id: "candidate-1",
      requirementStatus: "SOURCE_REVIEW_REQUIRED",
      requirementText: null,
    });
    await service.decideCandidate(tenant, "project-1", "candidate-1", {
      watchRevision: 3,
      decision: "NOT_APPLICABLE",
    });
    expect(candidateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ decision: "NOT_APPLICABLE" }),
      }),
    );
  });

  it("approves a candidate using the AI's own extracted wording when none is submitted", async () => {
    const { service, candidateUpdate } = serviceWithLoadedWatch({
      id: "candidate-1",
      requirementStatus: "READY",
      requirementText: "Exigence extraite telle quelle par l’IA depuis le texte source.",
    });
    await service.decideCandidate(tenant, "project-1", "candidate-1", {
      watchRevision: 3,
      decision: "APPLICABLE",
    });
    expect(candidateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requirementText: "Exigence extraite telle quelle par l’IA depuis le texte source.",
          requirementStatus: "READY",
        }),
      }),
    );
    expect(candidateUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty("requirementSource");
  });

  it("rejects approving a candidate with no extractable requirement and no override", async () => {
    const { service } = serviceWithLoadedWatch({
      id: "candidate-1",
      requirementStatus: "SOURCE_REVIEW_REQUIRED",
      requirementText: null,
    });
    await expect(
      service.decideCandidate(tenant, "project-1", "candidate-1", {
        watchRevision: 3,
        decision: "APPLICABLE",
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

  it("no longer blocks publication for a candidate with unresolved source quality", async () => {
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
          candidates: [
            { requirementStatus: "SOURCE_REVIEW_REQUIRED", requiresReview: true, decision: null },
          ],
        }),
      },
    };
    // The source-quality gate no longer short-circuits publication with "Publication is
    // blocked" — it now falls through to the ordinary review-completeness gate, since this
    // candidate is still undecided.
    await expect(
      service.publish(tenant, "project-1", {
        analysisRunId: "run-1",
        watchRevision: 3,
      }),
    ).rejects.toThrow("Every regulatory change must be reviewed before publishing");
  });

  it("supersedes a partial run during an explicit rerun", async () => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    const enqueue = vi.fn().mockResolvedValue({ jobId: "job-2" });
    const assertWorkerAvailable = vi.fn().mockResolvedValue(undefined);
    const service = new RegulatoryWatchService({ enqueue, assertWorkerAvailable } as never);
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
        analyses: [{ id: "run-1", status: "PARTIAL" }],
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

  it("returns 503 without creating a run when no regulatory worker is registered", async () => {
    const assertWorkerAvailable = vi
      .fn()
      .mockRejectedValue(new ServiceUnavailableException("No regulatory worker"));
    const service = new RegulatoryWatchService({ assertWorkerAvailable } as never);
    const ensureWatch = vi.fn();
    (service as unknown as { ensureWatch: typeof ensureWatch }).ensureWatch = ensureWatch;

    await expect(
      service.startAnalysis(tenant, "project-1", { languages: ["fr"] }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(ensureWatch).not.toHaveBeenCalled();
  });

  it("looks up a run by READY_FOR_REVIEW or PARTIAL status so a partial run can be published", async () => {
    const service = new RegulatoryWatchService({} as never);
    (service as unknown as { loadedWatch(): Promise<unknown> }).loadedWatch = async () => ({
      id: "watch-1",
      revision: 3,
    });
    const findFirst = vi.fn().mockResolvedValue(null);
    (service as unknown as { database: object }).database = {
      regulatoryAnalysisRun: { findFirst },
    };

    await expect(
      service.publish(tenant, "project-1", {
        analysisRunId: "partial-run",
        watchRevision: 3,
      }),
    ).rejects.toThrow("Reviewable regulatory analysis not found");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ["READY_FOR_REVIEW", "PARTIAL"] } }),
      }),
    );
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
