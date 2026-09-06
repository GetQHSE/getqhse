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
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: () => ({ responses: vi.fn() }) }));

import { RegulatoryAnalysisProcessor } from "./regulatory-analysis.processor.js";

// Discovery understands the project first; only then does source resolution consult PostgreSQL.
describe("MVP applicable-law discovery", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    generated.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  const catalog = [
    { documentId: "law-1", title: "Loi test", referenceNumber: "Loi 1", tags: ["Travail"] },
  ];
  const article = {
    provisionId: "article-1",
    documentId: "law-1",
    documentVersionId: "v1",
    documentTitle: "Loi test",
    referenceNumber: "Loi 1",
    documentFamily: "regulation",
    provisionType: "article",
    identifier: "Article 1",
    title: null,
    headingPath: [],
    language: "fr",
    content: "L’employeur doit protéger les salariés contre les risques professionnels.",
    contentHash: "hash",
    score: 1,
  };
  const lead = {
    reference: "Loi 09-08",
    title: "Protection des données personnelles",
    reason: "Le projet traite des données personnelles.",
  };
  const storedProposal = {
    reference: "Loi n° 1",
    title: "Loi test",
    reason: "Le projet emploie des salariés.",
  };

  function harness(entries = catalog) {
    const events: string[] = [];
    const db = {
      $queryRaw: vi
        .fn()
        .mockImplementationOnce(async () => {
          events.push("database");
          return entries;
        })
        .mockResolvedValueOnce([article]),
      regulatoryAnalysisRun: {
        findUnique: vi.fn().mockResolvedValue({ status: "RUNNING" }),
        update: vi.fn().mockResolvedValue({}),
      },
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
    return { db, events, run };
  }

  function respond(laws = [storedProposal, lead], events?: string[]) {
    generated.mockImplementation(async (input: { prompt: string }) => {
      events?.push("model");
      expect(input.prompt).not.toContain("law-1");
      expect(input.prompt).not.toContain("Loi test");
      return {
        output: { laws },
        totalUsage: { inputTokens: 100, outputTokens: 50 },
      };
    });
  }

  it("asks the model from the full profile before reading the law catalog", async () => {
    const { db, events, run } = harness();
    respond([storedProposal, lead], events);
    await expect(run()).resolves.toEqual([article]);
    expect(events).toEqual(["model", "database"]);
    expect(generated).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("employeeCount"),
      }),
    );
    expect(db.regulatoryModelCall.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage: "discovery", provisionId: null }),
      }),
    );
    expect(db.regulatoryAnalysisRun.update).toHaveBeenCalledWith({
      where: { id: "run" },
      data: { missingLaws: [lead] },
    });
    const sql = db.$queryRaw.mock.calls[0]![0] as { sql: string };
    expect(sql.sql).toContain('"validated_at" IS NOT NULL');
    expect(sql.sql).not.toContain("embedding");
  });

  it("loads text only for laws whose references resolve to an approved database source", async () => {
    const { db, run } = harness();
    respond();
    await expect(run()).resolves.toEqual([article]);
    const sourceSql = db.$queryRaw.mock.calls[1]![0] as { values: unknown[] };
    expect(sourceSql.values).toContain("law-1");
  });

  it("retains every proposed law as source-required when the corpus is empty", async () => {
    const { db, run } = harness([]);
    respond();
    await expect(run()).resolves.toEqual([]);
    expect(db.regulatoryAnalysisRun.update).toHaveBeenCalledWith({
      where: { id: "run" },
      data: { missingLaws: [storedProposal, lead] },
    });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("allows the model to return no potentially applicable law", async () => {
    const { db, run } = harness();
    generated.mockResolvedValue({
      output: { laws: [] },
      totalUsage: { inputTokens: 100, outputTokens: 50 },
    });
    await expect(run()).resolves.toEqual([]);
    expect(db.regulatoryAnalysisRun.update).toHaveBeenCalledWith({
      where: { id: "run" },
      data: { missingLaws: [] },
    });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("fails visibly on model failure instead of treating it as no applicable law", async () => {
    const { run } = harness();
    generated.mockRejectedValue(new Error("provider down"));
    await expect(run()).rejects.toMatchObject({ code: "REGULATORY_MODEL_UNAVAILABLE" });
  });
});
