import { RegulatoryAnalysisError } from "@qhse/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildRegulatoryQueries,
  canCarryForwardRequirement,
  computeProfileChanges,
  dedupeRegulatoryProvisions,
  isStructurallyEligibleProvision,
  matchProvisionRevision,
  regulatoryClassificationProgress,
  regulatoryCostMicroUsd,
  batchForTriage,
  isMissingProvisionForeignKeyError,
  isRateLimitError,
  normalizeTriageDecisions,
  parseRateLimitRetryDelayMs,
  regulatoryModelLimits,
  RegulatoryAnalysisProcessor,
  selectTriageSurvivors,
  splitReservedCost,
  validateRequirementDraft,
} from "./regulatory-analysis.processor.js";
import { regulatoryProvisionGoldenFixtures } from "./fixtures/regulatory-provisions.golden.js";

describe("regulatory analysis query planning", () => {
  it("applies stage-specific output bounds and the three-minute timeout", () => {
    expect(regulatoryModelLimits("drafting")).toEqual({
      timeoutMs: 180_000,
      maxOutputTokens: 12_000,
    });
    expect(regulatoryModelLimits("verification")).toEqual({
      timeoutMs: 180_000,
      maxOutputTokens: 6_000,
    });
  });

  it("calculates GPT-5 mini cost in integer micro-dollars", () => {
    expect(regulatoryCostMicroUsd(1_000_000, 1_000_000)).toBe(2_250_000);
    expect(regulatoryCostMicroUsd(1_000, 500)).toBe(1_250);
  });

  it("advances classification progress from 50 to 92 percent", () => {
    expect(regulatoryClassificationProgress(0, 10)).toBe(50);
    expect(regulatoryClassificationProgress(1, 10)).toBeGreaterThan(50);
    expect(regulatoryClassificationProgress(5, 10)).toBe(71);
    expect(regulatoryClassificationProgress(10, 10)).toBe(92);
    expect(regulatoryClassificationProgress(12, 10)).toBe(92);
  });

  it("builds bounded searches from the regulatory profile snapshot", () => {
    const queries = buildRegulatoryQueries({
      fields: {
        "organization.primarySector": "Métallurgie",
        "organization.offerings": ["Armoires métalliques", "Soudage"],
        "operations.keyProcesses": ["Découpe", "Peinture"],
        "scope.operatingCountries": ["MA"],
        "regulatory.knownRequirements": ["ISO 9001"],
      },
    });
    expect(queries.length).toBeGreaterThan(6);
    expect(queries.length).toBeLessThanOrEqual(12);
    expect(queries[0]).toContain("Métallurgie");
    expect(queries.some((query) => query.includes("ISO 9001"))).toBe(true);
    expect(queries.every((query) => query.length < 20_000)).toBe(true);
  });

  it("computes only material profile changes", () => {
    expect(
      computeProfileChanges(
        { fields: { sector: "Métallurgie", countries: ["MA"] } },
        { fields: { sector: "Métallurgie", countries: ["MA", "FR"] } },
      ),
    ).toEqual([{ key: "countries", previous: ["MA"], current: ["MA", "FR"] }]);
  });

  it("matches unchanged and modified provisions across revisions by logical identity", () => {
    const previous = {
      documentId: "document-1",
      language: "fr",
      identifier: "Article 12",
      headingPath: ["Titre II"],
      contentHash: "hash-1",
    };
    expect(matchProvisionRevision(previous, [{ ...previous }]).changeType).toBe("UNCHANGED");
    expect(
      matchProvisionRevision(previous, [{ ...previous, contentHash: "hash-2" }]).changeType,
    ).toBe("MODIFIED");
  });

  it("never guesses when a provision is missing or ambiguous", () => {
    const previous = {
      documentId: "document-1",
      language: "ar",
      identifier: null,
      headingPath: ["المادة 12"],
      contentHash: "hash-1",
    };
    expect(matchProvisionRevision(previous, [])).toEqual({
      match: null,
      changeType: "REMOVAL_PROPOSED",
      ambiguous: false,
    });
    expect(matchProvisionRevision(previous, [{ ...previous }, { ...previous }])).toMatchObject({
      match: null,
      changeType: "REMOVAL_PROPOSED",
      ambiguous: true,
    });
  });
});

describe("regulatory triage", () => {
  it("splits the retrieved candidates into groups of at most batchSize", () => {
    const candidates = [
      { provisionId: "a" },
      { provisionId: "b" },
      { provisionId: "c" },
      { provisionId: "d" },
      { provisionId: "e" },
    ];

    expect(batchForTriage(candidates, 2)).toEqual([
      [{ provisionId: "a" }, { provisionId: "b" }],
      [{ provisionId: "c" }, { provisionId: "d" }],
      [{ provisionId: "e" }],
    ]);
    expect(batchForTriage(candidates, 10)).toEqual([candidates]);
    expect(batchForTriage([], 10)).toEqual([]);
  });

  it("recognizes an OpenAI TPM rate limit error and parses its suggested retry delay", () => {
    const rateLimitError = new Error(
      "Rate limit reached for gpt-5-mini in organization org-x on tokens per min (TPM): " +
        "Limit 500000, Used 471107, Requested 38350. Please try again in 1.134s. Visit https://platform.openai.com/account/rate-limits to learn more.",
    );
    expect(isRateLimitError(rateLimitError)).toBe(true);
    expect(isRateLimitError(new Error("boom"))).toBe(false);
    expect(isRateLimitError("not an error")).toBe(false);

    expect(parseRateLimitRetryDelayMs(rateLimitError, 5_000)).toBe(1_384);
    expect(parseRateLimitRetryDelayMs(new Error("Please try again in 0s."), 5_000)).toBe(5_000);
    expect(parseRateLimitRetryDelayMs(new Error("no hint here"), 5_000)).toBe(5_000);
  });

  it("recognizes a regulatory_model_calls foreign key violation on a deleted provision", () => {
    const prismaError = {
      code: "P2003",
      meta: { modelName: "RegulatoryModelCall" },
      message:
        "Foreign key constraint violated on the constraint: `regulatory_model_calls_provision_id_fkey`",
    };
    expect(isMissingProvisionForeignKeyError(prismaError)).toBe(true);
    expect(isMissingProvisionForeignKeyError({ code: "P2003", meta: { modelName: "Other" } })).toBe(
      false,
    );
    expect(isMissingProvisionForeignKeyError({ code: "P2002" })).toBe(false);
    expect(isMissingProvisionForeignKeyError(new Error("boom"))).toBe(false);
    expect(isMissingProvisionForeignKeyError(null)).toBe(false);
  });

  it("splits a shared batch cost across its members, exactly and without remainder loss", () => {
    expect(splitReservedCost(100, 4)).toEqual([25, 25, 25, 25]);
    expect(splitReservedCost(10, 3)).toEqual([4, 3, 3]);
    const shares = splitReservedCost(101, 7);
    expect(shares).toHaveLength(7);
    expect(shares.reduce((total, share) => total + share, 0)).toBe(101);
    expect(splitReservedCost(50, 1)).toEqual([50]);
  });

  it("ignores decisions outside the batch and drops duplicates, keeping the first", () => {
    const batch = [{ provisionId: "a" }, { provisionId: "b" }];
    const rawDecisions = [
      { provisionId: "a", likelyApplicable: "YES" as const },
      { provisionId: "hallucinated-id", likelyApplicable: "NO" as const },
      { provisionId: "a", likelyApplicable: "NO" as const },
    ];

    expect(normalizeTriageDecisions(batch, rawDecisions)).toEqual([
      { provisionId: "a", likelyApplicable: "YES" },
    ]);
  });

  it("keeps undecided and YES candidates, drops NO, gates UNSURE behind includeUnsure", () => {
    const candidates = [
      { provisionId: "no-decision-made" },
      { provisionId: "said-no" },
      { provisionId: "said-yes" },
      { provisionId: "said-unsure" },
    ];
    const decisions = [
      { provisionId: "said-no", likelyApplicable: "NO" as const },
      { provisionId: "said-yes", likelyApplicable: "YES" as const },
      { provisionId: "said-unsure", likelyApplicable: "UNSURE" as const },
    ];

    expect(
      selectTriageSurvivors(candidates, decisions, true).map((candidate) => candidate.provisionId),
    ).toEqual(["no-decision-made", "said-yes", "said-unsure"]);

    expect(
      selectTriageSurvivors(candidates, decisions, false).map((candidate) => candidate.provisionId),
    ).toEqual(["no-decision-made", "said-yes"]);
  });
});

describe("regulatory model-call ledger", () => {
  const previousDatabaseUrl = process.env["DATABASE_URL"];

  beforeEach(() => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
  });

  afterEach(() => {
    if (previousDatabaseUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = previousDatabaseUrl;
  });

  it("charges the full reservation when usage is unknown after a timeout", async () => {
    const processor = new RegulatoryAnalysisProcessor();
    const callUpdate = vi.fn().mockResolvedValue({});
    const runUpdate = vi.fn().mockResolvedValue({});
    const transactionClient = {
      regulatoryModelCall: {
        findUnique: vi.fn().mockResolvedValue({ status: "RUNNING" }),
        update: callUpdate,
      },
      regulatoryAnalysisRun: { update: runUpdate },
    };
    (processor as unknown as { database: object }).database = {
      $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => Promise<void>) =>
        callback(transactionClient),
      ),
    };
    const settle = (
      processor as unknown as {
        settleModelCall(
          runId: string,
          reservation: { id: string; reservedMicroUsd: number },
          result: { status: "TIMED_OUT"; latencyMs: number; errorCode: string },
        ): Promise<void>;
      }
    ).settleModelCall.bind(processor);

    await settle(
      "run-1",
      { id: "call-1", reservedMicroUsd: 25_000 },
      { status: "TIMED_OUT", latencyMs: 180_001, errorCode: "REGULATORY_MODEL_TIMEOUT" },
    );

    expect(callUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "TIMED_OUT", costMicroUsd: 25_000 }),
      }),
    );
    expect(runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          reservedMicroUsd: { decrement: 25_000 },
          spentMicroUsd: { increment: 25_000 },
        },
      }),
    );
  });

  it("stops before creating a call whose reservation would exceed the run budget", async () => {
    const processor = new RegulatoryAnalysisProcessor();
    const create = vi.fn();
    const transactionClient = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          status: "RUNNING",
          budgetMicroUsd: 10_000,
          spentMicroUsd: 9_900,
          reservedMicroUsd: 0,
        },
      ]),
      regulatoryAnalysisRun: {
        findUnique: vi.fn().mockResolvedValue({
          status: "RUNNING",
          budgetMicroUsd: 10_000,
          spentMicroUsd: 9_900,
          reservedMicroUsd: 0,
        }),
      },
      regulatoryModelCall: { create },
    };
    (processor as unknown as { database: object }).database = {
      $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
      ),
    };
    const reserve = (
      processor as unknown as {
        reserveModelCall(input: Record<string, unknown>): Promise<unknown>;
      }
    ).reserveModelCall.bind(processor);

    await expect(
      reserve({
        runId: "run-1",
        provisionId: "article-1",
        clarificationRevision: 0,
        stage: "drafting",
        attempt: 1,
        model: "gpt-5-mini",
        prompt: { system: "system", context: "context" },
        maxOutputTokens: 12_000,
      }),
    ).rejects.toThrow("budget is exhausted");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("accuracy-first provision quality gates", () => {
  it("excludes every non-normative golden fixture and retains valid clauses and articles", () => {
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;
    for (const fixture of regulatoryProvisionGoldenFixtures) {
      const predicted = isStructurallyEligibleProvision(fixture);
      expect(predicted, fixture.name).toBe(fixture.expectedEligible);
      if (predicted && fixture.expectedEligible) truePositive += 1;
      if (predicted && !fixture.expectedEligible) falsePositive += 1;
      if (!predicted && fixture.expectedEligible) falseNegative += 1;
    }
    const precision = truePositive / (truePositive + falsePositive);
    const recall = truePositive / (truePositive + falseNegative);
    expect(precision).toBeGreaterThanOrEqual(0.95);
    expect(recall).toBeGreaterThanOrEqual(0.95);
  });

  it("deduplicates a logical provision identifier before AI analysis", () => {
    const valid = regulatoryProvisionGoldenFixtures.find(
      (fixture) => fixture.name === "valid ISO operational clause",
    )!;
    const provisions = dedupeRegulatoryProvisions([
      {
        ...valid,
        provisionId: "low-score",
        documentId: "iso-9001",
        documentVersionId: "v1",
        documentTitle: "ISO 9001",
        referenceNumber: "ISO 9001:2015",
        language: "fr",
        contentHash: "hash-low",
        score: 0.2,
      },
      {
        ...valid,
        provisionId: "high-score",
        documentId: "iso-9001",
        documentVersionId: "v1",
        documentTitle: "ISO 9001",
        referenceNumber: "ISO 9001:2015",
        language: "fr",
        contentHash: "hash-high",
        score: 0.9,
      },
    ]);
    expect(provisions).toHaveLength(1);
    expect(provisions[0]?.provisionId).toBe("high-score");
  });

  it("requires exact supporting excerpts from the same source", () => {
    const source = regulatoryProvisionGoldenFixtures.find(
      (fixture) => fixture.name === "Moroccan article",
    )!.content;
    expect(
      validateRequirementDraft(
        source,
        "L’employeur doit prendre les mesures nécessaires pour préserver la sécurité et la santé des salariés.",
        ["préserver la sécurité, la santé et la dignité des salariés"],
      ),
    ).toEqual([]);
    expect(
      validateRequirementDraft(source, "L’employeur doit organiser une formation annuelle.", [
        "formation annuelle obligatoire",
      ]),
    ).toContain("Un extrait justificatif n’est pas une citation exacte de la disposition.");
  });

  it("rejects long source copying and inputs that would be truncated", () => {
    const source =
      "L’organisme doit déterminer surveiller revoir et mettre à jour les informations nécessaires afin de maîtriser durablement tous les processus opérationnels pertinents pour assurer la conformité constante des produits et services fournis aux clients concernés.";
    expect(validateRequirementDraft(source, source, [source.slice(0, 80)])).toContain(
      "L’exigence copie un passage trop long de la source au lieu de le reformuler.",
    );
    expect(
      validateRequirementDraft(
        "Article 1 — " + "texte normatif ".repeat(2_500),
        "L’organisme doit respecter la disposition applicable.",
        ["Article 1"],
      ),
    ).toContain("La disposition dépasse la taille maximale et serait tronquée.");
  });

  it("carries forward only a supported requirement on an unchanged source and profile", () => {
    const source = regulatoryProvisionGoldenFixtures.find(
      (fixture) => fixture.name === "valid ISO context clause",
    )!.content;
    const candidate = {
      changeType: "UNCHANGED" as const,
      content: source,
      previousRequirementText:
        "L’organisme doit déterminer les enjeux externes et internes pertinents pour sa finalité et son orientation stratégique.",
      previousRequirementSupportingExcerpts: [
        "déterminer les enjeux externes et internes pertinents par rapport à sa finalité et à son orientation stratégique",
      ],
    };
    expect(canCarryForwardRequirement(candidate, [])).toBe(true);
    expect(canCarryForwardRequirement({ ...candidate, changeType: "MODIFIED" }, [])).toBe(false);
    expect(canCarryForwardRequirement(candidate, [{ key: "scope" }])).toBe(false);
  });
});

describe("regulatory analysis embedding profile diagnosis", () => {
  const previousDatabaseUrl = process.env["DATABASE_URL"];
  const previousRagFlag = process.env["NORMATIVE_RAG_ENABLED"];
  const previousApiKey = process.env["OPENAI_API_KEY"];

  beforeEach(() => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    process.env["NORMATIVE_RAG_ENABLED"] = "true";
    process.env["OPENAI_API_KEY"] = "sk-test";
  });

  afterEach(() => {
    restore("DATABASE_URL", previousDatabaseUrl);
    restore("NORMATIVE_RAG_ENABLED", previousRagFlag);
    restore("OPENAI_API_KEY", previousApiKey);
  });

  function restore(key: string, value: string | undefined) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  /**
   * Builds a processor whose Prisma client is replaced, then exposes the
   * private resolver the analysis phase depends on.
   */
  function resolverWith(database: object) {
    const processor = new RegulatoryAnalysisProcessor();
    (processor as unknown as { database: object }).database = database;
    return () =>
      (
        processor as unknown as { resolveActiveEmbeddingProfile(): Promise<{ id: string }> }
      ).resolveActiveEmbeddingProfile();
  }

  function databaseWith(profiles: Array<Record<string, unknown>>, unindexedChunk: object | null) {
    return {
      embeddingProfile: {
        findFirst: vi.fn(async ({ where }: { where: { status: unknown } }) => {
          const wanted =
            typeof where.status === "string"
              ? [where.status]
              : ((where.status as { in: string[] }).in ?? []);
          const matches = profiles.filter((profile) =>
            wanted.includes(profile["status"] as string),
          );
          return (
            [...matches].sort((a, b) => Number(b["version"] ?? 0) - Number(a["version"] ?? 0))[0] ??
            null
          );
        }),
      },
      documentChunk: { findFirst: vi.fn().mockResolvedValue(unindexedChunk) },
    };
  }

  it("returns the active profile when it covers every searchable revision", async () => {
    const active = { id: "profile-3", key: "openai:v3", status: "ACTIVE", version: 3 };
    await expect(resolverWith(databaseWith([active], null))()).resolves.toMatchObject({
      id: "profile-3",
    });
  });

  it("reports a missing profile when the corpus was never indexed", async () => {
    await expect(resolverWith(databaseWith([], null))()).rejects.toThrowError(
      expect.objectContaining({ code: "EMBEDDING_PROFILE_MISSING" }),
    );
  });

  it("distinguishes an in-progress build from a profile awaiting activation", async () => {
    const building = { id: "profile-1", key: "openai:v1", status: "BUILDING", version: 1 };
    await expect(resolverWith(databaseWith([building], null))()).rejects.toThrowError(
      expect.objectContaining({ code: "EMBEDDING_PROFILE_BUILDING" }),
    );

    const ready = { id: "profile-2", key: "openai:v2", status: "READY", version: 2 };
    await expect(resolverWith(databaseWith([ready], null))()).rejects.toThrowError(
      expect.objectContaining({ code: "EMBEDDING_PROFILE_NOT_ACTIVATED" }),
    );
  });

  it("reports a stale profile when newly published content is unindexed", async () => {
    // The profile is ACTIVE, so search "works" — but the retriever silently
    // drops every revision with an unindexed chunk, which reads as an empty
    // corpus rather than a rollout gap unless we name it.
    const active = { id: "profile-3", key: "openai:v3", status: "ACTIVE", version: 3 };
    await expect(resolverWith(databaseWith([active], { id: "chunk-9" }))()).rejects.toThrowError(
      expect.objectContaining({ code: "EMBEDDING_PROFILE_STALE" }),
    );
  });

  it("prefers the newest pending profile when several exist", async () => {
    const profiles = [
      { id: "profile-1", key: "openai:v1", status: "READY", version: 1 },
      { id: "profile-2", key: "openai:v2", status: "BUILDING", version: 2 },
    ];
    await expect(resolverWith(databaseWith(profiles, null))()).rejects.toThrowError(
      expect.objectContaining({ code: "EMBEDDING_PROFILE_BUILDING" }),
    );
  });
});

describe("regulatory analysis failure recording", () => {
  const previousDatabaseUrl = process.env["DATABASE_URL"];

  beforeEach(() => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
  });

  afterEach(() => {
    if (previousDatabaseUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = previousDatabaseUrl;
  });

  function processorFailingWith(error: Error) {
    const runUpdate = vi.fn();
    const processor = new RegulatoryAnalysisProcessor();
    const database = {
      regulatoryAnalysisRun: {
        findUnique: vi.fn().mockResolvedValue({ id: "run-1", status: "RUNNING", watchId: "w-1" }),
        update: runUpdate,
      },
      projectRegulatoryWatch: { update: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    (processor as unknown as { database: object }).database = database;
    (processor as unknown as { analyze(): Promise<void> }).analyze = () => Promise.reject(error);
    return { processor, runUpdate };
  }

  const job = { data: { payload: { runId: "run-1" } } } as never;

  it("persists the specific reason rather than a blanket failure", async () => {
    const { processor, runUpdate } = processorFailingWith(
      new RegulatoryAnalysisError("EMBEDDING_PROFILE_NOT_ACTIVATED", "profile v2 is READY"),
    );

    await expect(processor.process(job)).rejects.toThrow("profile v2 is READY");
    expect(runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorCode: "EMBEDDING_PROFILE_NOT_ACTIVATED",
          errorMessage: "profile v2 is READY",
        }),
      }),
    );
  });

  it("falls back to ANALYSIS_FAILED for an uncoded error", async () => {
    const { processor, runUpdate } = processorFailingWith(new Error("boom"));

    await expect(processor.process(job)).rejects.toThrow("boom");
    expect(runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errorCode: "ANALYSIS_FAILED" }) }),
    );
  });
});
