import { llmReasoningEfforts } from "@qhse/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generated = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({
  embed: vi.fn(),
  generateText: generated,
  Output: { object: vi.fn(({ schema }) => ({ schema })) },
}));

const responses = vi.hoisted(() => vi.fn((modelId: string) => ({ modelId })));
const embedding = vi.hoisted(() => vi.fn(() => ({ modelId: "embedding" })));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => ({ responses, embedding }),
  openai: { responses, embedding },
}));

import { RegulatoryAnalysisProcessor } from "./regulatory-analysis.processor.js";

describe("independent regulatory requirement verification", () => {
  const previousDatabaseUrl = process.env["DATABASE_URL"];

  beforeEach(() => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    process.env["OPENAI_API_KEY"] = "sk-test";
    process.env["OPENAI_REGULATORY_MODEL"] = "gpt-5-mini";
    process.env["OPENAI_REGULATORY_REASONING_EFFORT"] = "low";
    generated.mockReset();
    responses.mockClear();
  });

  afterEach(() => {
    if (previousDatabaseUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = previousDatabaseUrl;
    delete process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_REGULATORY_MODEL"];
    delete process.env["OPENAI_REGULATORY_REASONING_EFFORT"];
  });

  type ClassifyResult = {
    results: Array<{
      requirementText: string | null;
      requirementStatus: string;
      requirementIssues: string[];
    }>;
  };

  function createDatabaseStub() {
    let modelCallSequence = 0;
    const update = vi.fn().mockResolvedValue({});
    const runSnapshot = { status: "RUNNING" };
    const database = {
      regulatoryAnalysisRun: {
        findUnique: vi.fn().mockResolvedValue(runSnapshot),
        update,
      },
      regulatoryModelCall: {
        create: vi.fn().mockImplementation(async () => ({ id: `call-${++modelCallSequence}` })),
        findUnique: vi.fn().mockResolvedValue({ status: "RUNNING" }),
        update: vi.fn().mockResolvedValue({}),
      },
      regulatoryApplicabilityCandidate: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(1),
      },
      $transaction: vi.fn(async (input: unknown) =>
        typeof input === "function"
          ? (input as (tx: typeof database) => Promise<unknown>)(database)
          : Promise.all(input as Promise<unknown>[]),
      ),
    };
    return { database, update };
  }

  const articleContent =
    "Article 24 — L’employeur est tenu de prendre toutes les mesures nécessaires afin de préserver la sécurité, la santé et la dignité des salariés.";

  async function classifyArticle24(database: object, updateProgress = vi.fn()) {
    const processor = new RegulatoryAnalysisProcessor();
    (processor as unknown as { database: object }).database = database;
    const classify = (
      processor as unknown as {
        classifyProvisions(
          run: unknown,
          candidates: unknown[],
          changes: unknown[],
          job: unknown,
        ): Promise<ClassifyResult>;
      }
    ).classifyProvisions.bind(processor);
    updateProgress.mockResolvedValue(undefined);
    const results = await classify(
      {
        id: "run-1",
        clarificationRevision: 0,
        profileSnapshot: { data: { fields: { "organization.employeeCount": 12 } } },
        baseBaseline: null,
        scopeFacts: [],
      },
      [
        {
          provisionId: "article-24",
          documentId: "code-travail",
          documentVersionId: "v1",
          documentTitle: "Code du travail",
          referenceNumber: "Loi n° 65-99",
          documentFamily: "regulation",
          provisionType: "article",
          identifier: "Article 24",
          title: null,
          headingPath: ["Livre premier"],
          language: "fr",
          content: articleContent,
          contentHash: "hash-24",
          score: 1,
          previousEntryId: null,
          changeType: "ADDED",
          changeSummary: null,
          previousRationale: null,
          previousRequirementText: null,
          previousRequirementSupportingExcerpts: [],
        },
      ],
      [],
      { id: "job-1", updateProgress },
    );
    return { results, updateProgress };
  }

  // A requirement lifted straight out of the source has nothing for the independent verifier to
  // check, so the pipeline must reach READY on the drafting call alone. This is the whole saving:
  // if a verification call still fires here, the skip has silently stopped working.
  it("skips the independent verifier when the draft quotes the source verbatim", async () => {
    generated.mockResolvedValueOnce({
      output: {
        suggestion: "APPLICABLE",
        rationale: "Le projet emploie des salariés.",
        matchedProfileKeys: ["organization.employeeCount"],
        confidence: 0.97,
        clarificationQuestion: null,
        sourceQuality: "PASS",
        normativeRequirement: true,
        requirementText:
          "L’employeur est tenu de prendre toutes les mesures nécessaires afin de préserver la sécurité, la santé et la dignité des salariés.",
        supportingExcerpts: [
          "prendre toutes les mesures nécessaires afin de préserver la sécurité, la santé et la dignité des salariés",
        ],
        qualityIssues: [],
      },
      totalUsage: { inputTokens: 100, outputTokens: 50 },
    });

    const { database } = createDatabaseStub();
    const { results } = await classifyArticle24(database);

    expect(generated).toHaveBeenCalledTimes(1);
    expect(database.regulatoryModelCall.create).toHaveBeenCalledTimes(1);
    expect(results.results[0]).toMatchObject({
      requirementStatus: "READY",
      requirementIssues: [],
    });
  });

  it("retries drafting once with verifier feedback and accepts the corrected requirement", async () => {
    generated
      .mockResolvedValueOnce({
        output: {
          suggestion: "APPLICABLE",
          rationale: "Le projet emploie des salariés.",
          matchedProfileKeys: ["organization.employeeCount"],
          confidence: 0.96,
          clarificationQuestion: null,
          sourceQuality: "PASS",
          normativeRequirement: true,
          requirementText:
            "L’employeur doit préserver la sécurité et la santé des salariés et organiser une formation annuelle.",
          supportingExcerpts: ["préserver la sécurité, la santé et la dignité des salariés"],
          qualityIssues: [],
        },
        totalUsage: { inputTokens: 100, outputTokens: 50 },
      })
      .mockResolvedValueOnce({
        output: {
          supported: false,
          issues: ["La formation annuelle n’est pas mentionnée dans la disposition."],
        },
        totalUsage: { inputTokens: 40, outputTokens: 15 },
      })
      .mockResolvedValueOnce({
        output: {
          suggestion: "APPLICABLE",
          rationale: "Le projet emploie des salariés.",
          matchedProfileKeys: ["organization.employeeCount"],
          confidence: 0.98,
          clarificationQuestion: null,
          sourceQuality: "PASS",
          normativeRequirement: true,
          requirementText:
            "L’employeur doit prendre les mesures nécessaires pour préserver la sécurité, la santé et la dignité des salariés.",
          supportingExcerpts: [
            "prendre toutes les mesures nécessaires afin de préserver la sécurité, la santé et la dignité des salariés",
          ],
          qualityIssues: [],
        },
        totalUsage: { inputTokens: 110, outputTokens: 45 },
      })
      .mockResolvedValueOnce({
        output: { supported: true, issues: [] },
        totalUsage: { inputTokens: 40, outputTokens: 10 },
      });

    const processor = new RegulatoryAnalysisProcessor();
    const update = vi.fn().mockResolvedValue({});
    let modelCallSequence = 0;
    const database = {
      regulatoryAnalysisRun: {
        findUnique: vi.fn().mockResolvedValue({ status: "RUNNING" }),
        update,
      },
      regulatoryModelCall: {
        create: vi.fn().mockImplementation(async () => ({ id: `call-${++modelCallSequence}` })),
        findUnique: vi.fn().mockResolvedValue({ status: "RUNNING" }),
        update: vi.fn().mockResolvedValue({}),
      },
      regulatoryApplicabilityCandidate: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(1),
      },
      $transaction: vi.fn(async (input: unknown) =>
        typeof input === "function"
          ? (input as (tx: typeof database) => Promise<unknown>)(database)
          : Promise.all(input as Promise<unknown>[]),
      ),
    };
    (processor as unknown as { database: object }).database = database;
    const classify = (
      processor as unknown as {
        classifyProvisions(
          run: unknown,
          candidates: unknown[],
          changes: unknown[],
          job: unknown,
        ): Promise<{
          results: Array<{
            requirementText: string | null;
            requirementStatus: string;
            requirementIssues: string[];
          }>;
        }>;
      }
    ).classifyProvisions.bind(processor);
    const updateProgress = vi.fn().mockResolvedValue(undefined);
    const candidates = await classify(
      {
        id: "run-1",
        clarificationRevision: 0,
        profileSnapshot: { data: { fields: { "organization.employeeCount": 12 } } },
        baseBaseline: null,
        scopeFacts: [],
      },
      [
        {
          provisionId: "article-24",
          documentId: "code-travail",
          documentVersionId: "v1",
          documentTitle: "Code du travail",
          referenceNumber: "Loi n° 65-99",
          documentFamily: "regulation",
          provisionType: "article",
          identifier: "Article 24",
          title: null,
          headingPath: ["Livre premier"],
          language: "fr",
          content:
            "Article 24 — L’employeur est tenu de prendre toutes les mesures nécessaires afin de préserver la sécurité, la santé et la dignité des salariés.",
          contentHash: "hash-24",
          score: 1,
          previousEntryId: null,
          changeType: "ADDED",
          changeSummary: null,
          previousRationale: null,
          previousRequirementText: null,
          previousRequirementSupportingExcerpts: [],
        },
      ],
      [],
      { id: "job-1", updateProgress },
    );

    expect(generated).toHaveBeenCalledTimes(4);
    expect(candidates.results[0]).toMatchObject({
      requirementStatus: "READY",
      requirementIssues: [],
      requirementText:
        "L’employeur doit prendre les mesures nécessaires pour préserver la sécurité, la santé et la dignité des salariés.",
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          model: "gpt-5-mini",
        }),
      }),
    );
    expect(database.regulatoryModelCall.create).toHaveBeenCalledTimes(4);
    expect(generated).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ timeout: 180_000, maxOutputTokens: 12_000, maxRetries: 0 }),
    );
    expect(generated).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ timeout: 180_000, maxOutputTokens: 10_000, maxRetries: 0 }),
    );
    // Drafting stays on the primary model; the containment check runs on the cheaper one.
    expect(responses.mock.calls.map(([modelId]) => modelId)).toEqual([
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-mini",
      "gpt-5-nano",
    ]);
    // The verification stage once asked for "none", which the gpt-5 family rejects outright — the
    // run only failed after ~18 minutes of drafting had already been paid for. Every effort this
    // pipeline sends has to be one the models accept.
    const efforts = (
      generated.mock.calls as Array<[{ providerOptions: { openai: { reasoningEffort: string } } }]>
    ).map(([call]) => call.providerOptions.openai.reasoningEffort);
    expect(efforts).toEqual(["low", "minimal", "low", "minimal"]);
    for (const effort of efforts) {
      expect(llmReasoningEfforts).toContain(effort);
    }
    expect(updateProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "classification_retrying",
        progress: 50,
        completed: 0,
        total: 1,
        provisionId: "article-24",
        attempt: 2,
      }),
    );
    expect(updateProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: "classification",
        progress: 92,
        completed: 1,
        total: 1,
        stage: "provision_completed",
      }),
    );
  });

  it("degrades to manual review instead of aborting the run when the verifier call itself fails", async () => {
    // NoOutputGeneratedError (the model reasoned through its whole output budget without ever
    // emitting the schema) or a rate limit that outlasts every retry both surface here as a
    // rejected generate() call. Before this test, that exception propagated all the way out of
    // classifyProvisions and failed the entire analysis run — discarding every other candidate
    // it had already classified — for a problem that is local to one candidate's verification.
    const paraphrasedRequirement =
      "L’employeur doit préserver la sécurité et la santé des salariés et organiser une formation annuelle.";
    const draft = {
      suggestion: "APPLICABLE" as const,
      rationale: "Le projet emploie des salariés.",
      matchedProfileKeys: ["organization.employeeCount"],
      confidence: 0.96,
      clarificationQuestion: null,
      sourceQuality: "PASS" as const,
      normativeRequirement: true,
      requirementText: paraphrasedRequirement,
      supportingExcerpts: ["préserver la sécurité, la santé et la dignité des salariés"],
      qualityIssues: [],
    };
    generated
      .mockResolvedValueOnce({ output: draft, totalUsage: { inputTokens: 100, outputTokens: 50 } })
      .mockRejectedValueOnce(new Error("No output generated."))
      .mockResolvedValueOnce({ output: draft, totalUsage: { inputTokens: 100, outputTokens: 50 } })
      .mockRejectedValueOnce(new Error("No output generated."));

    const { database } = createDatabaseStub();
    const { results } = await classifyArticle24(database);

    expect(generated).toHaveBeenCalledTimes(4);
    expect(results.results[0]).toMatchObject({
      requirementStatus: "SOURCE_REVIEW_REQUIRED",
      requirementIssues: [
        "Le vérificateur indépendant n’a pas pu être interrogé ; vérification manuelle requise.",
      ],
    });
  });

  it("degrades to manual review instead of aborting the run when drafting itself fails", async () => {
    // A TPM rate limit that outlasts every retry, or a model that reasons through its whole
    // output budget without emitting the schema, is a failure local to this one candidate — not
    // proof the run should stop. Before this test, that exception propagated all the way out of
    // classifyProvisions and discarded every other candidate the run had already classified, 14
    // minutes into a run that had nothing to show for it.
    generated.mockRejectedValueOnce(new Error("No output generated."));

    const { database } = createDatabaseStub();
    const { results } = await classifyArticle24(database);

    expect(generated).toHaveBeenCalledTimes(1);
    expect(results.results[0]).toMatchObject({
      suggestion: "TO_CONFIRM",
      confidence: 0,
      requirementStatus: "SOURCE_REVIEW_REQUIRED",
      requirementIssues: [
        "Le modèle n’a pas pu traiter cette disposition ; une nouvelle analyse ou une revue manuelle est nécessaire.",
      ],
    });
    // The candidate is still persisted rather than silently dropped, so it reappears for the
    // next analysis or a manual review instead of vanishing from the register.
    expect(database.regulatoryApplicabilityCandidate.upsert).toHaveBeenCalled();
  });

  it("carries forward the presumption of applicability when a previously tracked candidate's drafting fails", async () => {
    generated.mockRejectedValueOnce(new Error("No output generated."));

    const { database } = createDatabaseStub();
    const processor = new RegulatoryAnalysisProcessor();
    (processor as unknown as { database: object }).database = database;
    const updateProgress = vi.fn().mockResolvedValue(undefined);
    const classify = (
      processor as unknown as {
        classifyProvisions(
          run: unknown,
          candidates: unknown[],
          changes: unknown[],
          job: unknown,
        ): Promise<ClassifyResult>;
      }
    ).classifyProvisions.bind(processor);
    const { results } = await classify(
      {
        id: "run-1",
        clarificationRevision: 0,
        profileSnapshot: { data: { fields: { "organization.employeeCount": 12 } } },
        baseBaseline: null,
        scopeFacts: [],
      },
      [
        {
          provisionId: "article-24",
          documentId: "code-travail",
          documentVersionId: "v1",
          documentTitle: "Code du travail",
          referenceNumber: "Loi n° 65-99",
          documentFamily: "regulation",
          provisionType: "article",
          identifier: "Article 24",
          title: null,
          headingPath: ["Livre premier"],
          language: "fr",
          content: articleContent,
          contentHash: "hash-24",
          score: 1,
          previousEntryId: "entry-24",
          changeType: "MODIFIED",
          changeSummary: "La source a changé de révision.",
          previousRationale: "Le projet emploie des salariés.",
          previousRequirementText: "Ancienne formulation approuvée par un réviseur.",
          previousRequirementSupportingExcerpts: ["extrait antérieur"],
        },
      ],
      [],
      { id: "job-1", updateProgress },
    );

    expect(results[0]).toMatchObject({
      suggestion: "APPLICABLE",
      requirementText: "Ancienne formulation approuvée par un réviseur.",
      requirementSupportingExcerpts: ["extrait antérieur"],
      requirementStatus: "SOURCE_REVIEW_REQUIRED",
    });
  });

  it("restores a completed candidate checkpoint without making duplicate model calls", async () => {
    const processor = new RegulatoryAnalysisProcessor();
    (processor as unknown as { database: object }).database = {
      regulatoryAnalysisRun: {
        findUnique: vi.fn().mockResolvedValue({ status: "RUNNING" }),
        update: vi.fn().mockResolvedValue({}),
      },
      regulatoryApplicabilityCandidate: {
        findMany: vi.fn().mockResolvedValue([
          {
            provisionId: "article-24",
            suggestion: "APPLICABLE",
            rationale: "Checkpoint validé avant le redémarrage.",
            matchedProfileKeys: ["organization.employeeCount"],
            confidence: 0.98,
            clarificationQuestion: null,
            requirementText:
              "L’employeur doit prendre les mesures nécessaires pour préserver la sécurité et la santé des salariés.",
            requirementStatus: "READY",
            requirementSupportingExcerpts: [
              "préserver la sécurité, la santé et la dignité des salariés",
            ],
            requirementIssues: [],
            requirementSource: "AI",
          },
        ]),
      },
    };
    const classify = (
      processor as unknown as {
        classifyProvisions(
          run: unknown,
          candidates: unknown[],
          changes: unknown[],
          job: unknown,
        ): Promise<{ results: Array<{ provisionId: string }> }>;
      }
    ).classifyProvisions.bind(processor);
    const updateProgress = vi.fn().mockResolvedValue(undefined);

    const outcome = await classify(
      {
        id: "run-1",
        clarificationRevision: 0,
        profileSnapshot: { data: { fields: {} } },
        baseBaseline: null,
        scopeFacts: [],
      },
      [
        {
          provisionId: "article-24",
          documentId: "code-travail",
          documentVersionId: "v1",
          documentTitle: "Code du travail",
          referenceNumber: "Loi n° 65-99",
          documentFamily: "regulation",
          provisionType: "article",
          identifier: "Article 24",
          title: null,
          headingPath: ["Livre premier"],
          language: "fr",
          content:
            "Article 24 — L’employeur est tenu de prendre toutes les mesures nécessaires afin de préserver la sécurité, la santé et la dignité des salariés.",
          contentHash: "hash-24",
          score: 1,
          previousEntryId: null,
          changeType: "ADDED",
          changeSummary: null,
          previousRationale: null,
          previousRequirementText: null,
          previousRequirementSupportingExcerpts: [],
        },
      ],
      [],
      { id: "job-1", updateProgress },
    );

    expect(outcome.results).toHaveLength(1);
    expect(generated).not.toHaveBeenCalled();
    expect(updateProgress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "checkpoint_recovered", completed: 1, total: 1 }),
    );
  });
});
