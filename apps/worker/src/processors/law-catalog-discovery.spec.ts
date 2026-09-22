import type * as DatabaseModule from "@qhse/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generated, databaseFactory } = vi.hoisted(() => ({
  generated: vi.fn(),
  databaseFactory: vi.fn(),
}));
vi.mock("ai", () => ({
  generateText: generated,
  Output: { object: vi.fn(({ schema }) => ({ schema })) },
}));
vi.mock("@qhse/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  createPrismaClient: databaseFactory,
}));
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => ({
    responses: vi.fn(),
    tools: { webSearch: vi.fn(() => ({ type: "provider-defined" })) },
  }),
}));

import { RegulatoryAnalysisProcessor } from "./regulatory-analysis.processor.js";

// Applicability discovery is law-level and does not expand platform documents into provisions.
describe("MVP applicable-law discovery", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    generated.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  const lead = {
    reference: "Loi 09-08",
    title: "Protection des données personnelles",
    reason: "Le projet traite des données personnelles.",
    sourceUrl: null,
    applicableRequirements: [],
  };
  const storedProposal = {
    reference: "Loi n° 1",
    title: "Loi test",
    reason: "Le projet emploie des salariés.",
    sourceUrl: null,
    applicableRequirements: [],
  };

  function harness() {
    const events: string[] = [];
    const db = {
      $queryRaw: vi.fn(),
      regulatoryAnalysisRun: {
        findUnique: vi.fn().mockResolvedValue({ status: "RUNNING" }),
        update: vi.fn().mockResolvedValue({}),
      },
      embeddingProfile: { findFirst: vi.fn().mockResolvedValue(null) },
      aiKnowledgeExample: { findMany: vi.fn().mockResolvedValue([]) },
      regulatoryModelCall: {
        create: vi.fn().mockResolvedValue({ id: "call-1" }),
        findUnique: vi.fn().mockResolvedValue({ status: "RUNNING" }),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (callback: unknown): Promise<unknown> =>
        typeof callback === "function"
          ? (callback as (tx: unknown) => Promise<unknown>)(db)
          : Promise.all(callback as Promise<unknown>[]),
      ),
    };
    databaseFactory.mockReturnValue(db);
    const processor = new RegulatoryAnalysisProcessor();
    const retrieve = (
      processor as unknown as { retrieveAdditions(run: unknown, job: unknown): Promise<unknown[]> }
    ).retrieveAdditions.bind(processor);
    const run = () =>
      retrieve(
        {
          id: "run",
          asOf: new Date("2026-09-06"),
          languages: ["fr"],
          clarificationRevision: 0,
          profileSnapshot: { data: { employeeCount: 12 } },
          scopeFacts: [],
        },
        { updateProgress: vi.fn() },
      );
    return { db, events, processor, run };
  }

  function respond(laws = [storedProposal, lead], events?: string[]) {
    generated.mockImplementation(async (input: { prompt: string }) => {
      events?.push("model");
      expect(input.prompt).not.toContain("law-1");
      expect(input.prompt).not.toContain("Loi test");
      return {
        output: { laws },
        totalUsage: { inputTokens: 100, outputTokens: 50 },
        sources: [],
      };
    });
  }

  it("asks the model from the full profile without reading the law catalog", async () => {
    const { db, events, run } = harness();
    respond([storedProposal, lead], events);
    await expect(run()).resolves.toEqual({
      provisions: [],
      discoveredLaws: [storedProposal, lead],
    });
    expect(events).toEqual(["model"]);
    expect(generated).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("employeeCount"),
        maxRetries: 2,
        tools: expect.objectContaining({ web_search: expect.anything() }),
        toolChoice: { type: "tool", toolName: "web_search" },
      }),
    );
    expect(db.regulatoryModelCall.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage: "discovery", provisionId: null }),
      }),
    );
    expect(db.regulatoryAnalysisRun.update).toHaveBeenCalledWith({
      where: { id: "run" },
      data: { missingLaws: [] },
    });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("adds approved discovery knowledge without exposing provenance", async () => {
    const { db, run } = harness();
    db.aiKnowledgeExample.findMany.mockResolvedValue([
      {
        id: "knowledge-1",
        feature: "DISCOVERY",
        title: "Gestion des déchets industriels",
        scenarioSummary: "Site industriel produisant des déchets.",
        guidance: "La loi sur les déchets manquait.",
        jurisdiction: "MA",
        language: "fr",
        tags: ["déchets"],
        rating: 1,
        expectedResult: null,
        evaluationSignal: null,
        payload: {
          includedLaws: [
            {
              reference: "Loi 28-00",
              title: "Gestion des déchets",
              reason: "Le site produit des déchets industriels.",
            },
          ],
          excludedLaws: [],
        },
      },
    ]);
    generated.mockResolvedValue({
      output: { laws: [] },
      totalUsage: { inputTokens: 100, outputTokens: 50 },
      sources: [],
    });

    await run();

    expect(db.aiKnowledgeExample.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ feature: "DISCOVERY", status: "ACTIVE" }),
        take: 5,
      }),
    );
    expect(generated).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("La loi sur les déchets manquait."),
      }),
    );
    expect(generated.mock.calls.at(-1)?.[0].prompt).not.toContain("secret-organization");
  });

  it("can disable web search for local free-tier testing", async () => {
    vi.stubEnv("REGULATORY_WEB_SEARCH_ENABLED", "false");
    const { run } = harness();
    respond();

    await expect(run()).resolves.toEqual({
      provisions: [],
      discoveredLaws: [storedProposal, lead],
    });

    expect(generated).toHaveBeenCalledWith(
      expect.not.objectContaining({
        tools: expect.anything(),
        toolChoice: expect.anything(),
      }),
    );
  });

  it("does not expand a model-generated law into stored document provisions", async () => {
    const { db, run } = harness();
    respond();
    await expect(run()).resolves.toEqual({
      provisions: [],
      discoveredLaws: [storedProposal, lead],
    });
    expect(db.regulatoryAnalysisRun.update).toHaveBeenCalledWith({
      where: { id: "run" },
      data: { missingLaws: [] },
    });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("keeps only source URLs returned by the web-search tool", async () => {
    const { db, run } = harness();
    generated.mockResolvedValue({
      output: {
        laws: [
          { ...lead, sourceUrl: "https://adala.justice.gov.ma/official#article" },
          { ...storedProposal, sourceUrl: "https://invented.example/law" },
        ],
      },
      totalUsage: { inputTokens: 100, outputTokens: 50 },
      sources: [
        {
          type: "source",
          sourceType: "url",
          id: "source-1",
          url: "https://adala.justice.gov.ma/official",
        },
      ],
    });
    await expect(run()).resolves.toEqual({
      provisions: [],
      discoveredLaws: [
        { ...lead, sourceUrl: "https://adala.justice.gov.ma/official" },
        storedProposal,
      ],
    });
    expect(db.regulatoryAnalysisRun.update).toHaveBeenCalledWith({
      where: { id: "run" },
      data: { missingLaws: [] },
    });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("allows the model to return no potentially applicable law", async () => {
    const { db, run } = harness();
    generated.mockResolvedValue({
      output: { laws: [] },
      totalUsage: { inputTokens: 100, outputTokens: 50 },
      sources: [],
    });
    await expect(run()).resolves.toEqual({ provisions: [], discoveredLaws: [] });
    expect(db.regulatoryAnalysisRun.update).toHaveBeenCalledWith({
      where: { id: "run" },
      data: { missingLaws: [] },
    });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("fails visibly on model failure instead of treating it as no applicable law", async () => {
    const { processor, run } = harness();
    const error = vi.fn();
    (processor as unknown as { logger: { error: typeof error } }).logger = { error };
    generated.mockRejectedValue(
      Object.assign(new Error("response body containing private project data"), {
        statusCode: 403,
        data: { error: { code: "web_search_not_allowed" } },
      }),
    );

    await expect(run()).rejects.toMatchObject({ code: "REGULATORY_MODEL_UNAVAILABLE" });
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "regulatory_discovery_model_call_failed",
        providerStatusCode: 403,
        providerErrorCode: "web_search_not_allowed",
      }),
      "applicable-law discovery model call failed",
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("private project data");
  });

  it("unwraps retry failures to log the safe provider error code", async () => {
    const { processor, run } = harness();
    const error = vi.fn();
    (processor as unknown as { logger: { error: typeof error } }).logger = { error };
    generated.mockRejectedValue({
      name: "AI_RetryError",
      lastError: {
        name: "AI_APICallError",
        statusCode: 429,
        data: {
          error: {
            code: "billing_not_active",
            message: "provider detail that must not be logged",
          },
        },
      },
    });

    await expect(run()).rejects.toMatchObject({ code: "REGULATORY_MODEL_UNAVAILABLE" });
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        providerStatusCode: 429,
        providerErrorCode: "billing_not_active",
        providerErrorType: "AI_RetryError",
      }),
      "applicable-law discovery model call failed",
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain(
      "provider detail that must not be logged",
    );
  });

  it("persists a source-less discovery as a first-class candidate", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue({});
    databaseFactory.mockReturnValue({
      regulatoryApplicabilityCandidate: {
        createMany,
        count: vi.fn().mockResolvedValue(1),
      },
      regulatoryAnalysisRun: { update },
    });
    const processor = new RegulatoryAnalysisProcessor();
    const persist = (
      processor as unknown as {
        persistDiscoveredLawCandidates(
          runId: string,
          revision: number,
          candidates: unknown[],
        ): Promise<void>;
      }
    ).persistDiscoveredLawCandidates.bind(processor);

    await persist("run", 0, [
      {
        ...lead,
        previousEntryId: null,
        changeType: "ADDED",
        requiresReview: true,
        decision: null,
      },
    ]);

    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          provisionId: null,
          sourceType: "DISCOVERED_LAW",
          sourceReference: lead.reference,
          sourceTitle: lead.title,
          suggestion: "TO_CONFIRM",
          requirementStatus: "NOT_REQUIRED",
        }),
      ],
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "run" },
      data: { completedProvisions: 1 },
    });
  });

  it("carries article-level requirements into requirementText, gated on source review", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue({});
    databaseFactory.mockReturnValue({
      regulatoryApplicabilityCandidate: {
        createMany,
        count: vi.fn().mockResolvedValue(1),
      },
      regulatoryAnalysisRun: { update },
    });
    const processor = new RegulatoryAnalysisProcessor();
    const persist = (
      processor as unknown as {
        persistDiscoveredLawCandidates(
          runId: string,
          revision: number,
          candidates: unknown[],
        ): Promise<void>;
      }
    ).persistDiscoveredLawCandidates.bind(processor);

    await persist("run", 0, [
      {
        ...lead,
        applicableRequirements: [
          {
            reference: "Article 12",
            requirement: "Nommer un délégué à la protection des données.",
          },
          { reference: null, requirement: "Tenir un registre des traitements." },
        ],
        previousEntryId: null,
        changeType: "ADDED",
        requiresReview: true,
        decision: null,
      },
    ]);

    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          sourceType: "DISCOVERED_LAW",
          requirementText:
            "Article 12 : Nommer un délégué à la protection des données.\nTenir un registre des traitements.",
          requirementStatus: "SOURCE_REVIEW_REQUIRED",
          requirementSource: "AI",
        }),
      ],
    });
  });
});
