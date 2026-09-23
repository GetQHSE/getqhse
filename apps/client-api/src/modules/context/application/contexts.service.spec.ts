import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ContextsService } from "./contexts.service.js";

const tenant = { organizationId: "org-1", userId: "reviewer-1", role: "member" };

function withDatabase(service: ContextsService, database: object) {
  (service as unknown as { database: object }).database = database;
}

function newService(answerAssist: object = { assess: vi.fn() }) {
  return new ContextsService({ enqueue: vi.fn() } as never, answerAssist as never, {} as never);
}

describe("ContextsService.applyIssueOverride", () => {
  const baseIssue: {
    id: string;
    projectId: string;
    origin: string | null;
    aiOrigin: string;
    categoryKey: string | null;
    aiCategoryKey: string;
    categoryLabel: string | null;
    aiCategoryLabel: string;
    title: string | null;
    aiTitle: string;
    description: string | null;
    aiDescription: string;
    nature: string | null;
    aiNature: string;
    impactQuality: string | null;
    aiImpactQuality: string | null;
    impactCustomerSatisfaction: string | null;
    aiImpactCustomerSatisfaction: string | null;
    impactOverall: string | null;
    aiImpactOverall: string | null;
    scores: unknown;
    aiScores: unknown;
    userSelectedPriority: boolean | null;
    aiRecommendedPriority: boolean;
    reviewStatus: string;
  } = {
    id: "issue-1",
    projectId: "project-1",
    origin: null,
    aiOrigin: "INTERNAL",
    categoryKey: null,
    aiCategoryKey: "ressources",
    categoryLabel: null,
    aiCategoryLabel: "Ressources",
    title: null,
    aiTitle: "Rotation élevée du personnel",
    description: null,
    aiDescription: "Le taux de rotation dépasse la moyenne du secteur.",
    nature: null,
    aiNature: "faiblesse",
    impactQuality: null,
    aiImpactQuality: null,
    impactCustomerSatisfaction: null,
    aiImpactCustomerSatisfaction: null,
    impactOverall: null,
    aiImpactOverall: null,
    scores: null,
    aiScores: {},
    userSelectedPriority: null,
    aiRecommendedPriority: false,
    reviewStatus: "PENDING",
  };

  function includeShape(overrides: Partial<typeof baseIssue> = {}) {
    return {
      ...baseIssue,
      ...overrides,
      aiConfidence: null,
      aiGeneratedAt: new Date("2026-09-01T00:00:00.000Z"),
      humanOverride: false,
      humanReviewedAt: null,
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      sourceKind: "AI",
      canonicalKey: "rotation-personnel",
      comparisonStatus: null,
      runId: "run-1",
      aiModel: "gpt-5-mini",
      aiReasoning: null,
      evidence: [],
      corrections: [],
    };
  }

  it("writes a correction only for a field that materially differs from the effective value", async () => {
    const findFirst = vi.fn().mockResolvedValue(includeShape());
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue(includeShape({ title: "Turnover maîtrisé" }));
    const service = newService();
    withDatabase(service, {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "project-1" }) },
      contextIssue: { findFirst },
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          contextIssueCorrection: { createMany },
          contextIssue: { update },
        }),
    });

    await service.applyIssueOverride(tenant, "project-1", "issue-1", {
      title: "Turnover maîtrisé",
      correctionReason: "Chiffres 2026 communiqués par la direction",
    });

    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          issueId: "issue-1",
          fieldName: "title",
          previousValue: "Rotation élevée du personnel",
          newValue: "Turnover maîtrisé",
          correctionReason: "Chiffres 2026 communiqués par la direction",
          correctedById: "reviewer-1",
        }),
      ],
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: "Turnover maîtrisé", humanOverride: true }),
      }),
    );
  });

  it("writes nothing at all for a no-op patch — not even humanReviewedAt", async () => {
    const findFirst = vi.fn().mockResolvedValue(includeShape());
    const transaction = vi.fn();
    const findFirstOrThrow = vi.fn().mockResolvedValue(includeShape());
    const service = newService();
    withDatabase(service, {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "project-1" }) },
      contextIssue: { findFirst, findFirstOrThrow },
      $transaction: transaction,
    });

    await service.applyIssueOverride(tenant, "project-1", "issue-1", {
      title: "Rotation élevée du personnel",
    });

    expect(transaction).not.toHaveBeenCalled();
  });

  it("compares against the AI value when validating an unchanged proposal — not a correction", async () => {
    const findFirst = vi.fn().mockResolvedValue(includeShape());
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue(includeShape({ reviewStatus: "VALIDATED" }));
    const service = newService();
    withDatabase(service, {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "project-1" }) },
      contextIssue: { findFirst },
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({ contextIssueCorrection: { createMany }, contextIssue: { update } }),
    });

    await service.applyIssueOverride(tenant, "project-1", "issue-1", {
      reviewStatus: "VALIDATED",
    });

    // Only review_status changed; title/description/etc. were not resupplied so are untouched.
    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ fieldName: "review_status", newValue: "validated" })],
    });
  });

  it("rejects an issue outside the tenant's project", async () => {
    const service = newService();
    withDatabase(service, {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "project-1" }) },
      contextIssue: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    await expect(
      service.applyIssueOverride(tenant, "project-1", "issue-x", { title: "x" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("ContextsService.createManualIssue", () => {
  it("refuses to attach a manual issue when no run has completed yet", async () => {
    const service = newService();
    withDatabase(service, {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "project-1" }) },
      contextAnalysisRun: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    await expect(
      service.createManualIssue(tenant, "project-1", {
        origin: "INTERNAL",
        nature: "faiblesse",
        title: "Nouvel enjeu",
        description: "Description suffisante de l'enjeu ajouté manuellement.",
        categoryKey: "ajout_manuel",
        categoryLabel: "Ajout manuel",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates the issue already reviewed and records the addition as a correction", async () => {
    const create = vi.fn().mockResolvedValue({ id: "issue-2" });
    const correctionCreate = vi.fn().mockResolvedValue({});
    const findFirstOrThrow = vi.fn().mockResolvedValue({
      id: "issue-2",
      evidence: [],
      corrections: [],
      aiScores: {},
      aiGeneratedAt: new Date(),
      updatedAt: new Date(),
      createdAt: new Date(),
      humanReviewedAt: new Date(),
    });
    const service = newService();
    withDatabase(service, {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "project-1" }) },
      contextAnalysisRun: { findFirst: vi.fn().mockResolvedValue({ id: "run-1" }) },
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          contextIssue: { create, findFirstOrThrow },
          contextIssueCorrection: { create: correctionCreate },
        }),
    });

    await service.createManualIssue(tenant, "project-1", {
      origin: "EXTERNAL",
      nature: "opportunite",
      title: "Nouveau marché export",
      description: "Un accord commercial ouvre un nouveau débouché export.",
      categoryKey: "ajout_manuel",
      categoryLabel: "Ajout manuel",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceKind: "MANUAL",
          reviewStatus: "VALIDATED",
          humanOverride: true,
          origin: "EXTERNAL",
          nature: "opportunite",
        }),
      }),
    );
    expect(correctionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fieldName: "source_kind", newValue: "manual" }),
      }),
    );
  });
});

describe("ContextsService settings", () => {
  it("reports the default method as non-explicit when nothing is persisted", async () => {
    const service = newService();
    withDatabase(service, {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "project-1" }) },
      projectContextSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    });

    const settings = await service.getSettings(tenant, "project-1");

    expect(settings).toEqual({ projectId: "project-1", analysisMethod: "SWOT", explicit: false });
  });

  it("reports an explicit choice once persisted, unaffected by later runs", async () => {
    const service = newService();
    withDatabase(service, {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "project-1" }) },
      projectContextSettings: {
        findUnique: vi.fn().mockResolvedValue({ analysisMethod: "PESTEL" }),
      },
    });

    const settings = await service.getSettings(tenant, "project-1");

    expect(settings).toEqual({ projectId: "project-1", analysisMethod: "PESTEL", explicit: true });
  });
});

describe("ContextsService.assistInternalInputAnswer", () => {
  it("passes the already-saved answer and history to the model port, never inventing a fact itself", async () => {
    const assess = vi.fn().mockResolvedValue({
      valid: true,
      quality: "sufficient",
      reason: "réponse suffisante",
      followUpQuestion: null,
      structuredAnswer: "Climat social stable, faible turnover.",
    });
    const service = newService({ assess });
    withDatabase(service, {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "project-1" }) },
      contextInternalInput: {
        findUnique: vi.fn().mockResolvedValue({ answerText: "Précédemment : climat correct." }),
      },
    });

    const result = await service.assistInternalInputAnswer(tenant, "project-1", {
      sectionKey: "culture_valeurs",
      questionKey: "cv_climat_social",
      questionLabel: "Comment décririez-vous le climat social ?",
      history: [{ role: "assistant", text: "Pouvez-vous préciser le taux de rotation ?" }],
      message: "Le turnover est faible, autour de 5% par an.",
    });

    expect(assess).toHaveBeenCalledWith(
      expect.objectContaining({
        savedAnswer: "Précédemment : climat correct.",
        history: [{ role: "assistant", text: "Pouvez-vous préciser le taux de rotation ?" }],
        message: "Le turnover est faible, autour de 5% par an.",
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.structuredAnswer).toBe("Climat social stable, faible turnover.");
  });

  it("passes savedAnswer as null for a question with nothing saved yet", async () => {
    const assess = vi.fn().mockResolvedValue({
      valid: false,
      quality: "unknown",
      reason: "réponse insuffisante",
      followUpQuestion: "Pouvez-vous donner un exemple concret ?",
      structuredAnswer: null,
    });
    const service = newService({ assess });
    withDatabase(service, {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "project-1" }) },
      contextInternalInput: { findUnique: vi.fn().mockResolvedValue(null) },
    });

    const result = await service.assistInternalInputAnswer(tenant, "project-1", {
      sectionKey: "culture_valeurs",
      questionKey: "cv_climat_social",
      questionLabel: "Comment décririez-vous le climat social ?",
      history: [],
      message: "Je ne sais pas trop.",
    });

    expect(assess).toHaveBeenCalledWith(expect.objectContaining({ savedAnswer: null }));
    expect(result.valid).toBe(false);
    expect(result.followUpQuestion).toBe("Pouvez-vous donner un exemple concret ?");
  });

  it("turns a model failure into a clean, actionable error instead of a fabricated verdict", async () => {
    const assess = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const service = newService({ assess });
    withDatabase(service, {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "project-1" }) },
      contextInternalInput: { findUnique: vi.fn().mockResolvedValue(null) },
    });

    await expect(
      service.assistInternalInputAnswer(tenant, "project-1", {
        sectionKey: "culture_valeurs",
        questionKey: "cv_climat_social",
        questionLabel: "Comment décririez-vous le climat social ?",
        history: [],
        message: "Bonne ambiance générale.",
      }),
    ).rejects.toThrow(/n'a pas pu analyser/);
  });
});
