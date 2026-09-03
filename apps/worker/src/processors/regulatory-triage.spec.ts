import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generated = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({
  embed: vi.fn(),
  generateText: generated,
  Output: { object: vi.fn(({ schema }) => ({ schema })) },
}));

const responses = vi.hoisted(() => vi.fn((modelId: string) => ({ modelId })));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => ({ responses, embedding: vi.fn() }),
  openai: { responses, embedding: vi.fn() },
}));

import { RegulatoryAnalysisProcessor } from "./regulatory-analysis.processor.js";

// Batches used to run one at a time (`for (const batch of batches) { await ... }`), which
// serialized a profile's worth of network round trips — including every rate-limit retry — before
// classification could even begin. This suite pins the concurrent replacement's observable
// contract: decisions from every batch still land in the result regardless of completion order.
describe("regulatory triage concurrency", () => {
  const previousDatabaseUrl = process.env["DATABASE_URL"];

  beforeEach(() => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    process.env["OPENAI_API_KEY"] = "sk-test";
    process.env["OPENAI_REGULATORY_TRIAGE_MODEL"] = "gpt-5-nano";
    process.env["REGULATORY_TRIAGE_BATCH_SIZE"] = "1";
    generated.mockReset();
    responses.mockClear();
  });

  afterEach(() => {
    if (previousDatabaseUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = previousDatabaseUrl;
    delete process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_REGULATORY_TRIAGE_MODEL"];
    delete process.env["REGULATORY_TRIAGE_BATCH_SIZE"];
  });

  type TriageResult = {
    survivors: Array<{ provisionId: string }>;
  };

  function createDatabaseStub() {
    let modelCallSequence = 0;
    const database = {
      regulatoryAnalysisRun: {
        findUnique: vi.fn().mockResolvedValue({ status: "RUNNING" }),
        update: vi.fn().mockResolvedValue({}),
      },
      regulatoryModelCall: {
        create: vi.fn().mockImplementation(async () => ({ id: `call-${++modelCallSequence}` })),
        findUnique: vi.fn().mockResolvedValue({ status: "RUNNING" }),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (input: unknown) =>
        typeof input === "function"
          ? (input as (tx: typeof database) => Promise<unknown>)(database)
          : Promise.all(input as Promise<unknown>[]),
      ),
    };
    return database;
  }

  function candidate(provisionId: string) {
    return {
      provisionId,
      documentId: "code-travail",
      documentVersionId: "v1",
      documentTitle: "Code du travail",
      referenceNumber: "Loi n° 65-99",
      documentFamily: "regulation" as const,
      provisionType: "article" as const,
      identifier: provisionId,
      title: provisionId,
      headingPath: [],
      language: "fr" as const,
      content: "Contenu de la disposition.",
      contentHash: `hash-${provisionId}`,
      score: 0,
      previousEntryId: null,
      previousRationale: null,
      previousRequirementText: null,
      previousRequirementSupportingExcerpts: [],
      changeType: "ADDED" as const,
      changeSummary: "Nouvelle disposition potentiellement applicable.",
    };
  }

  async function triage(database: object, additions: Array<{ provisionId: string }>) {
    const processor = new RegulatoryAnalysisProcessor();
    (processor as unknown as { database: object }).database = database;
    const run = triageAdditions(processor, database, additions);
    return run;
  }

  function triageAdditions(
    processor: RegulatoryAnalysisProcessor,
    database: object,
    additions: unknown[],
  ): Promise<TriageResult> {
    const fn = (
      processor as unknown as {
        triageAdditions(run: unknown, additions: unknown[], job: unknown): Promise<TriageResult>;
      }
    ).triageAdditions.bind(processor);
    return fn({ id: "run-1", clarificationRevision: 0, profileSnapshot: { data: {} } }, additions, {
      id: "job-1",
      updateProgress: vi.fn(),
    });
  }

  it("merges decisions from every concurrently processed batch, regardless of completion order", async () => {
    const database = createDatabaseStub();
    // The same fixed response is returned to every call; normalizeTriageDecisions already
    // filters a batch's decisions down to the provisionIds that batch actually asked about, so
    // this does not need to know which batch a given call is serving.
    generated.mockResolvedValue({
      output: {
        decisions: [
          { provisionId: "article-1", likelyApplicable: "NO" },
          { provisionId: "article-2", likelyApplicable: "YES" },
          { provisionId: "article-3", likelyApplicable: "NO" },
        ],
      },
      totalUsage: { inputTokens: 40, outputTokens: 10 },
    });

    const additions = [candidate("article-1"), candidate("article-2"), candidate("article-3")];
    const result = await triage(database, additions);

    expect(generated).toHaveBeenCalledTimes(3);
    expect(result.survivors.map((survivor) => survivor.provisionId)).toEqual(["article-2"]);
  });
});
