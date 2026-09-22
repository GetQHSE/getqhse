import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
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

describe("regulatory analysis reviews", () => {
  const tenant = { organizationId: "org-1", userId: "reviewer-1", role: "member" };

  it("records a submitted review inside the current tenant", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "review-1" });
    const knowledgeUpsert = vi.fn().mockResolvedValue({});
    const service = new RegulatoryWatchService({} as never);
    (service as unknown as { loadedWatch(): Promise<unknown> }).loadedWatch = async () => ({
      id: "watch-1",
      projectId: "project-1",
    });
    (service as unknown as { get(): Promise<unknown> }).get = async () => ({ id: "watch-1" });
    (service as unknown as { database: object }).database = {
      regulatoryAnalysisRun: { findFirst: vi.fn().mockResolvedValue({ id: "run-1" }) },
      regulatoryAnalysisReview: { upsert },
      aiKnowledgeExample: { upsert: knowledgeUpsert, deleteMany: vi.fn() },
    };

    await service.reviewAnalysis(tenant, "project-1", "run-1", {
      outcome: "SUBMITTED",
      rating: 0,
      comment: "Des textes importants manquent.",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runId: "run-1" },
        create: expect.objectContaining({
          organizationId: "org-1",
          reviewedById: "reviewer-1",
          rating: 0,
        }),
      }),
    );
    expect(knowledgeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          feature: "DISCOVERY",
          status: "DRAFT",
          sourceAnalysisReviewId: "review-1",
        }),
      }),
    );
  });

  it("stores a skip without a rating or comment", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "review-1" });
    const service = new RegulatoryWatchService({} as never);
    (service as unknown as { loadedWatch(): Promise<unknown> }).loadedWatch = async () => ({
      id: "watch-1",
    });
    (service as unknown as { get(): Promise<unknown> }).get = async () => ({ id: "watch-1" });
    (service as unknown as { database: object }).database = {
      regulatoryAnalysisRun: { findFirst: vi.fn().mockResolvedValue({ id: "run-1" }) },
      regulatoryAnalysisReview: { upsert },
      aiKnowledgeExample: { upsert: vi.fn(), deleteMany: vi.fn() },
    };

    await service.reviewAnalysis(tenant, "project-1", "run-1", { outcome: "SKIPPED" });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ outcome: "SKIPPED", rating: null, comment: null }),
      }),
    );
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
    const knowledgeUpsert = vi.fn().mockResolvedValue({});
    const service = new RegulatoryWatchService({} as never);
    (service as unknown as { currentEvaluation(): Promise<unknown> }).currentEvaluation =
      async () => ({
        id: "evaluation-1",
        aiSuggestedResult: "CONFORMING",
        entry: {
          sourceReference: "Loi 11-03",
          sourceTitle: "Protection de l'environnement",
          requirementText: "Conserver une preuve documentaire validée et à jour.",
          applicabilityRationale: "La loi est applicable.",
          baseline: { watch: { projectId: "project-1" } },
        },
      });
    (service as unknown as { get(): Promise<unknown> }).get = async () => ({ id: "watch-1" });
    (service as unknown as { database: object }).database = {
      regulatoryEvaluation: { updateMany: evaluationUpdateMany },
      regulatoryEvaluationAction: { count: vi.fn().mockResolvedValue(1), create: actionCreate },
      aiKnowledgeExample: { upsert: knowledgeUpsert },
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
    expect(knowledgeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          source: "HUMAN_CONFIRMATION",
          evaluationSignal: "CORRECTION",
          sourceRegulatoryEvaluationId: "evaluation-1",
        }),
      }),
    );
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
      regulatoryApplicabilityCandidate: {
        findFirst: vi.fn().mockResolvedValue({ sourceType: "PLATFORM_PROVISION", ...candidate }),
      },
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

  it("allows approving a discovered law without fabricating a requirement", async () => {
    const { service, candidateUpdate } = serviceWithLoadedWatch({
      id: "candidate-discovered",
      sourceType: "DISCOVERED_LAW",
      requirementStatus: "NOT_REQUIRED",
      requirementText: null,
    });
    await service.decideCandidate(tenant, "project-1", "candidate-discovered", {
      watchRevision: 3,
      decision: "APPLICABLE",
    });
    expect(candidateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decision: "APPLICABLE",
          requirementStatus: "NOT_REQUIRED",
        }),
      }),
    );
    expect(candidateUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty("requirementText");
  });

  it("keeps a discovered law's AI-drafted article under source review after approval", async () => {
    const { service, candidateUpdate } = serviceWithLoadedWatch({
      id: "candidate-discovered",
      sourceType: "DISCOVERED_LAW",
      requirementStatus: "SOURCE_REVIEW_REQUIRED",
      requirementText: "Article 12 : Nommer un délégué à la protection des données.",
    });
    await service.decideCandidate(tenant, "project-1", "candidate-discovered", {
      watchRevision: 3,
      decision: "APPLICABLE",
    });
    expect(candidateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decision: "APPLICABLE",
          requirementStatus: "SOURCE_REVIEW_REQUIRED",
        }),
      }),
    );
    // Approving applicability isn't approving the wording; the drafted text itself is untouched.
    expect(candidateUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty("requirementText");
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
          review: { id: "review-1" },
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

  it("exports a discovered law without source or approved requirement text", async () => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    const service = new RegulatoryWatchService({} as never);
    (service as unknown as { loadedWatch(): Promise<unknown> }).loadedWatch = async () => ({
      currentBaseline: {
        entries: [
          {
            sourceType: "DISCOVERED_LAW",
            sourceReference: "Loi n° 65-99",
            sourceTitle: "Code du travail",
            applicabilityRationale: "Applicable aux activités et salariés déclarés.",
            requirementText: null,
            provision: null,
            evaluation: {
              result: "NOT_ASSESSED",
              aiRationale: null,
              aiRemediationPlan: null,
              evidence: [],
              comment: null,
              actions: [],
            },
          },
        ],
      },
    });

    await expect(service.exportWorkbook(tenant, "project-1")).resolves.toBeInstanceOf(Buffer);
  });
});

describe("bulk regulatory review decisions", () => {
  const tenant = { organizationId: "org-1", userId: "reviewer-1", role: "owner" };

  function serviceWithCandidates(candidates: Array<Record<string, unknown>>) {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    const service = new RegulatoryWatchService({} as never);
    (service as unknown as { loadedWatch(): Promise<unknown> }).loadedWatch = async () => ({
      id: "watch-1",
      revision: 3,
    });
    const claim = vi.fn().mockResolvedValue({ count: 1 });
    const candidateUpdateMany = vi.fn().mockResolvedValue({ count: candidates.length });
    const transactionClient = {
      projectRegulatoryWatch: { updateMany: claim },
      regulatoryApplicabilityCandidate: { updateMany: candidateUpdateMany },
    };
    (service as unknown as { database: object }).database = {
      regulatoryApplicabilityCandidate: {
        findMany: vi.fn().mockResolvedValue(
          candidates.map((candidate) => ({
            sourceType: "PLATFORM_PROVISION",
            ...candidate,
          })),
        ),
      },
      $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient),
      ),
    };
    (service as unknown as { get(): Promise<unknown> }).get = async () => ({ id: "watch-1" });
    return { service, claim, candidateUpdateMany };
  }

  it("claims the watch revision once for the whole batch", async () => {
    const { service, claim, candidateUpdateMany } = serviceWithCandidates([
      { id: "candidate-ready", requirementText: "Une exigence extraite par l’analyse." },
      { id: "candidate-blocked", requirementText: null },
    ]);

    await service.decideCandidates(tenant, "project-1", {
      watchRevision: 3,
      decisions: [
        { candidateId: "candidate-ready", decision: "APPLICABLE" },
        { candidateId: "candidate-blocked", decision: "NOT_APPLICABLE" },
      ],
    });

    expect(claim).toHaveBeenCalledOnce();
    expect(claim).toHaveBeenCalledWith({
      where: { id: "watch-1", revision: 3 },
      data: { revision: { increment: 1 } },
    });
    expect(candidateUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["candidate-ready"] } },
        data: expect.objectContaining({
          decision: "APPLICABLE",
          decisionSource: "HUMAN",
          requirementStatus: "READY",
          reviewedById: "reviewer-1",
        }),
      }),
    );
    expect(candidateUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["candidate-blocked"] } },
        data: expect.objectContaining({ decision: "NOT_APPLICABLE" }),
      }),
    );
    // The AI wording is approved as it stands, so its provenance must not become human-edited.
    for (const call of candidateUpdateMany.mock.calls) {
      expect(call[0]?.data).not.toHaveProperty("requirementText");
      expect(call[0]?.data).not.toHaveProperty("requirementSource");
    }
  });

  it("rejects the whole batch when one approval has no requirement to record", async () => {
    const { service, claim } = serviceWithCandidates([
      { id: "candidate-ready", requirementText: "Une exigence extraite par l’analyse." },
      { id: "candidate-blocked", requirementText: null },
    ]);

    await expect(
      service.decideCandidates(tenant, "project-1", {
        watchRevision: 3,
        decisions: [
          { candidateId: "candidate-ready", decision: "APPLICABLE" },
          { candidateId: "candidate-blocked", decision: "APPLICABLE" },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(claim).not.toHaveBeenCalled();
  });

  it("retains a discovered law in bulk review without requiring provision wording", async () => {
    const { service, candidateUpdateMany } = serviceWithCandidates([
      {
        id: "candidate-discovered",
        sourceType: "DISCOVERED_LAW",
        requirementText: null,
      },
    ]);

    await service.decideCandidates(tenant, "project-1", {
      watchRevision: 3,
      decisions: [{ candidateId: "candidate-discovered", decision: "APPLICABLE" }],
    });

    expect(candidateUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["candidate-discovered"] } },
        data: expect.objectContaining({
          decision: "APPLICABLE",
          requirementStatus: "NOT_REQUIRED",
        }),
      }),
    );
  });

  it("keeps a discovered law's AI-drafted article under source review in bulk approval", async () => {
    const { service, candidateUpdateMany } = serviceWithCandidates([
      {
        id: "candidate-discovered",
        sourceType: "DISCOVERED_LAW",
        requirementText: "Article 12 : Nommer un délégué à la protection des données.",
      },
    ]);

    await service.decideCandidates(tenant, "project-1", {
      watchRevision: 3,
      decisions: [{ candidateId: "candidate-discovered", decision: "APPLICABLE" }],
    });

    expect(candidateUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["candidate-discovered"] } },
        data: expect.objectContaining({
          decision: "APPLICABLE",
          requirementStatus: "SOURCE_REVIEW_REQUIRED",
        }),
      }),
    );
  });

  it("refuses a batch that names a candidate outside the reviewable run", async () => {
    const { service } = serviceWithCandidates([
      { id: "candidate-ready", requirementText: "Une exigence extraite par l’analyse." },
    ]);

    await expect(
      service.decideCandidates(tenant, "project-1", {
        watchRevision: 3,
        decisions: [
          { candidateId: "candidate-ready", decision: "APPLICABLE" },
          { candidateId: "candidate-elsewhere", decision: "NOT_APPLICABLE" },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects bulk approval by regular members before touching persistence", async () => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    const service = new RegulatoryWatchService({} as never);
    await expect(
      service.decideCandidates(
        { organizationId: "org-1", userId: "user-1", role: "member" },
        "project-1",
        { watchRevision: 1, decisions: [{ candidateId: "candidate-1", decision: "APPLICABLE" }] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("regulatory action and evidence editing", () => {
  const tenant = { organizationId: "org-1", userId: "reviewer-1", role: "owner" } as const;

  function serviceWith(database: object) {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    const service = new RegulatoryWatchService({} as never);
    (service as unknown as { database: object }).database = database;
    (service as unknown as { get(): Promise<unknown> }).get = async () => ({ id: "watch-1" });
    (service as unknown as { loadedWatch(): Promise<unknown> }).loadedWatch = async () => ({
      currentBaselineId: "baseline-1",
    });
    return service;
  }

  it("persists the free-text responsable a reviewer types over the AI proposal", async () => {
    const update = vi.fn().mockResolvedValue({});
    const service = serviceWith({
      regulatoryEvaluationAction: {
        findFirst: vi.fn().mockResolvedValue({ id: "action-1" }),
        update,
      },
    });

    await service.updateAction(tenant, "project-1", "action-1", {
      responsibleName: "Responsable QHSE",
      dueDate: "2026-09-30",
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: expect.objectContaining({ responsibleName: "Responsable QHSE" }),
    });
  });

  it("leaves the responsable alone when the patch does not mention it", async () => {
    const update = vi.fn().mockResolvedValue({});
    const service = serviceWith({
      regulatoryEvaluationAction: {
        findFirst: vi.fn().mockResolvedValue({ id: "action-1" }),
        update,
      },
    });

    await service.updateAction(tenant, "project-1", "action-1", { title: "Corriger le tri" });

    expect(update.mock.calls[0]![0].data).not.toHaveProperty("responsibleName");
  });

  it("refuses evidence that does not hang off the current baseline", async () => {
    const service = serviceWith({
      regulatoryEvaluationEvidence: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    await expect(
      service.updateEvidence(tenant, "project-1", "evidence-1", { label: "Rapport" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteEvidence(tenant, "project-1", "evidence-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects a patch that would leave a NOTE preuve without its text", async () => {
    const service = serviceWith({
      regulatoryEvaluationEvidence: {
        findFirst: vi.fn().mockResolvedValue({
          id: "evidence-1",
          kind: "NOTE",
          fileId: null,
          url: null,
          note: "Constat terrain",
        }),
        update: vi.fn(),
      },
    });

    await expect(
      service.updateEvidence(tenant, "project-1", "evidence-1", { note: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("patches only the preuve fields the reviewer touched", async () => {
    const update = vi.fn().mockResolvedValue({});
    const service = serviceWith({
      regulatoryEvaluationEvidence: {
        findFirst: vi.fn().mockResolvedValue({
          id: "evidence-1",
          kind: "NOTE",
          fileId: null,
          url: null,
          note: "Constat terrain",
        }),
        update,
      },
    });

    await service.updateEvidence(tenant, "project-1", "evidence-1", { label: "Visite du 8 août" });

    expect(update).toHaveBeenCalledWith({
      where: { id: "evidence-1" },
      data: { label: "Visite du 8 août" },
    });
  });

  it("rejects evidence editing by read-only roles before touching persistence", async () => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    const service = new RegulatoryWatchService({} as never);
    const viewer = { organizationId: "org-1", userId: "user-1", role: "viewer" } as const;

    await expect(
      service.updateEvidence(viewer, "project-1", "evidence-1", { label: "x" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deleteEvidence(viewer, "project-1", "evidence-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
