import { RegulatoryAnalysisError } from "@qhse/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { regulatoryCostMicroUsd as computeCallCost } from "./regulatory-model-cost.js";
import {
  buildRegulatoryQueries,
  canCarryForwardRequirement,
  computeProfileChanges,
  dedupeRegulatoryProvisions,
  isStructurallyEligibleProvision,
  isVerbatimRequirement,
  matchProvisionRevision,
  regulatoryClassificationProgress,
  reservationOutcome,
  regulatoryCostMicroUsd,
  batchForTriage,
  isMissingProvisionForeignKeyError,
  isRateLimitError,
  normalizeTriageDecisions,
  parseRateLimitRetryDelayMs,
  regulatoryModelLimits,
  RegulatoryAnalysisProcessor,
  jitteredDelay,
  selectTriageSurvivors,
  settlementChargeMicroUsd,
  splitReservedCost,
  validateRequirementDraft,
} from "./regulatory-analysis.processor.js";
import {
  conservativeInputTokens,
  failureUsage,
  regulatoryModelRates,
  regulatoryVerificationModel,
  regulatoryProviderOptions,
  regulatoryServiceTier,
  regulatoryTriageModel,
} from "./regulatory-model-cost.js";
import { regulatoryProvisionGoldenFixtures } from "./fixtures/regulatory-provisions.golden.js";

describe("budget exhaustion versus reservation contention", () => {
  const budgetMicroUsd = 1_000_000;

  it("admits a call that fits against everything already committed", () => {
    expect(
      reservationOutcome(
        { spentMicroUsd: 500_000, reservedMicroUsd: 100_000, budgetMicroUsd },
        50_000,
      ),
    ).toBe("FITS");
  });

  it("stops the run when the call cannot fit even with nothing in flight", () => {
    // Spend is permanent, so no amount of waiting frees room for this call.
    expect(
      reservationOutcome({ spentMicroUsd: 990_000, reservedMicroUsd: 0, budgetMicroUsd }, 50_000),
    ).toBe("EXHAUSTED");
    expect(
      reservationOutcome(
        { spentMicroUsd: 990_000, reservedMicroUsd: 500_000, budgetMicroUsd },
        50_000,
      ),
    ).toBe("EXHAUSTED");
  });

  it("waits when only in-flight reservations are in the way", () => {
    // 400k spent + 50k for this call fits inside the budget; it is the peers' 580k of
    // conservative reservations that does not, and every one of those will be released.
    expect(
      reservationOutcome(
        { spentMicroUsd: 400_000, reservedMicroUsd: 580_000, budgetMicroUsd },
        50_000,
      ),
    ).toBe("CONTENDED");
  });

  it("never admits a call that would take the run past its ceiling", () => {
    // The boundary: exactly at the ceiling is allowed, one micro-dollar past it is not.
    expect(
      reservationOutcome({ spentMicroUsd: 900_000, reservedMicroUsd: 0, budgetMicroUsd }, 100_000),
    ).toBe("FITS");
    expect(
      reservationOutcome({ spentMicroUsd: 900_000, reservedMicroUsd: 0, budgetMicroUsd }, 100_001),
    ).toBe("EXHAUSTED");
  });
});

describe("conservative reservation sizing", () => {
  const bytesOf = (text: string) => Buffer.byteLength(text, "utf8");

  it("stays above the real token count for French and Arabic alike", () => {
    // A reservation is a cap, not an estimate: under-reserving would let a run outspend its
    // budget. French runs ~3.5 bytes per token and Arabic far fewer, so the bound must hold
    // for the denser of the two.
    const french = { system: "L’employeur ".repeat(400), context: "" };
    const arabic = { system: "يجب على صاحب العمل ".repeat(400), context: "" };
    for (const prompt of [french, arabic]) {
      const bytes = bytesOf(prompt.system) + bytesOf(prompt.context);
      // One token can never be fewer than two UTF-8 bytes of either script.
      expect(conservativeInputTokens(prompt)).toBeGreaterThanOrEqual(bytes / 2);
    }
  });

  it("no longer reserves the flat 16k-token overhead on top of every byte", () => {
    const prompt = { system: "a".repeat(20_000), context: "" };
    // Previously bytes + 16_384 = 36_384 for this prompt.
    expect(conservativeInputTokens(prompt)).toBe(12_048);
  });
});

describe("failure cost accounting", () => {
  it("charges a failure at its measured usage when the SDK reports one", () => {
    expect(
      failureUsage({
        usage: { inputTokens: 900, outputTokens: 120, inputTokenDetails: { cacheReadTokens: 400 } },
      }),
    ).toEqual({ inputTokens: 900, cachedInputTokens: 400, outputTokens: 120 });
  });

  it("falls back to the reservation when the failure carries no usable usage", () => {
    // Timeouts and transport errors: the tokens the provider generated are genuinely unknown,
    // so the conservative reservation stands rather than under-charging the run budget.
    expect(failureUsage(new Error("timed out"))).toBeNull();
    expect(failureUsage({ usage: { outputTokens: 10 } })).toBeNull();
    expect(failureUsage({ usage: null })).toBeNull();
    expect(failureUsage(null)).toBeNull();
  });
});

describe("settlement charging", () => {
  it("charges the real measured cost on success", () => {
    expect(
      settlementChargeMicroUsd(
        12_553,
        {
          status: "SUCCEEDED",
          inputTokens: 900,
          cachedInputTokens: 0,
          outputTokens: 120,
          reasoningTokens: 0,
          latencyMs: 1_000,
        },
        "gpt-5-mini",
      ),
    ).toBe(computeCallCost({ inputTokens: 900, outputTokens: 120 }, "gpt-5-mini"));
  });

  it("charges the SDK's measured usage on a failure that reports one", () => {
    expect(
      settlementChargeMicroUsd(
        12_553,
        {
          status: "FAILED",
          latencyMs: 500,
          errorCode: "REGULATORY_MODEL_UNAVAILABLE",
          usage: { inputTokens: 900, outputTokens: 120 },
        },
        "gpt-5-mini",
      ),
    ).toBe(computeCallCost({ inputTokens: 900, outputTokens: 120 }, "gpt-5-mini"));
  });

  it("charges nothing for a rate-limited rejection with no usage — the provider never ran it", () => {
    // The flex tier answers capacity pressure with a 429 by design, and each of up to
    // RATE_LIMIT_MAX_ATTEMPTS retries reserves and settles its own ledger row. Charging the
    // conservative reservation here billed every one of those retries in full for zero real
    // tokens, which is what let a handful of successful drafts eat most of a run's budget.
    expect(
      settlementChargeMicroUsd(
        12_553,
        { status: "FAILED", latencyMs: 200, errorCode: "REGULATORY_MODEL_RATE_LIMITED" },
        "gpt-5-mini",
      ),
    ).toBe(0);
  });

  it("still charges the full reservation for a rate-limited failure that did report usage", () => {
    expect(
      settlementChargeMicroUsd(
        12_553,
        {
          status: "FAILED",
          latencyMs: 200,
          errorCode: "REGULATORY_MODEL_RATE_LIMITED",
          usage: { inputTokens: 900, outputTokens: 120 },
        },
        "gpt-5-mini",
      ),
    ).toBe(computeCallCost({ inputTokens: 900, outputTokens: 120 }, "gpt-5-mini"));
  });

  it("keeps the conservative reservation for a fatal, non-rate-limited failure with no usage", () => {
    // A bare "FAILED" here is a run-ending error (schema validation, an unhandled 4xx/5xx) and
    // this code cannot tell whether it happened before or after generation started, so the
    // conservative charge stands rather than guessing.
    expect(
      settlementChargeMicroUsd(
        12_553,
        { status: "FAILED", latencyMs: 200, errorCode: "REGULATORY_MODEL_UNAVAILABLE" },
        "gpt-5-mini",
      ),
    ).toBe(12_553);
  });

  it("keeps the conservative reservation for a timeout, since its real usage is unknowable", () => {
    expect(
      settlementChargeMicroUsd(
        12_553,
        { status: "TIMED_OUT", latencyMs: 180_000, errorCode: "REGULATORY_MODEL_TIMEOUT" },
        "gpt-5-mini",
      ),
    ).toBe(12_553);
  });
});

describe("verbatim requirement detection", () => {
  const source =
    "L'employeur est tenu de tenir un registre des accidents du travail.\nCe registre est conservé pendant cinq ans et présenté à l'inspecteur du travail sur demande.";

  it("recognises a contiguous quote of the source", () => {
    expect(
      isVerbatimRequirement(
        source,
        "L'employeur est tenu de tenir un registre des accidents du travail.",
      ),
    ).toBe(true);
  });

  it("looks through layout artefacts that carry no meaning", () => {
    expect(
      isVerbatimRequirement(
        source,
        "Ce registre est conservé pendant cinq ans   et présenté à l'inspecteur du travail sur demande",
      ),
    ).toBe(true);
    expect(isVerbatimRequirement(source, "CE REGISTRE EST CONSERVE PENDANT CINQ ANS")).toBe(true);
  });

  it("rejects wording the source does not contain, so the verifier still runs", () => {
    // A changed number: the single highest-consequence kind of drift in a requirement.
    expect(isVerbatimRequirement(source, "Ce registre est conservé pendant dix ans")).toBe(false);
    // An added obligation that appears nowhere in the source.
    expect(
      isVerbatimRequirement(source, "L'employeur est tenu de tenir un registre numérique"),
    ).toBe(false);
    // Words of the source, reordered: not a quote.
    expect(
      isVerbatimRequirement(
        source,
        "Un registre des accidents du travail est tenu par l'employeur",
      ),
    ).toBe(false);
    expect(isVerbatimRequirement(source, null)).toBe(false);
    expect(isVerbatimRequirement(source, "   ")).toBe(false);
  });
});

describe("regulatory analysis query planning", () => {
  const costEnvironmentKeys = [
    "OPENAI_REGULATORY_SERVICE_TIER",
    "OPENAI_REGULATORY_INPUT_USD_PER_MTOK",
  ] as const;

  afterEach(() => {
    for (const key of costEnvironmentKeys) delete process.env[key];
  });

  it("applies stage-specific output bounds and the three-minute timeout", () => {
    expect(regulatoryModelLimits("drafting")).toEqual({
      timeoutMs: 180_000,
      maxOutputTokens: 12_000,
    });
    expect(regulatoryModelLimits("verification")).toEqual({
      timeoutMs: 180_000,
      maxOutputTokens: 10_000,
    });
  });

  it("calculates GPT-5 mini cost in integer micro-dollars at the standard tier", () => {
    process.env["OPENAI_REGULATORY_SERVICE_TIER"] = "default";
    expect(
      regulatoryCostMicroUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, "gpt-5-mini"),
    ).toBe(2_250_000);
    expect(regulatoryCostMicroUsd({ inputTokens: 1_000, outputTokens: 500 }, "gpt-5-mini")).toBe(
      1_250,
    );
  });

  it("bills prompt-cache reads at a tenth of the fresh input rate", () => {
    process.env["OPENAI_REGULATORY_SERVICE_TIER"] = "default";
    // cachedInputTokens is a subset of inputTokens, not an addition to it.
    expect(
      regulatoryCostMicroUsd(
        { inputTokens: 1_000_000, cachedInputTokens: 800_000, outputTokens: 0 },
        "gpt-5-mini",
      ),
    ).toBe(70_000);
    // A cache count above the reported input total can never bill more than the input total.
    expect(
      regulatoryCostMicroUsd(
        { inputTokens: 1_000, cachedInputTokens: 5_000, outputTokens: 0 },
        "gpt-5-mini",
      ),
    ).toBe(25);
  });

  it("halves every rate on the flex service tier", () => {
    delete process.env["OPENAI_REGULATORY_SERVICE_TIER"];
    expect(regulatoryServiceTier()).toBe("flex");
    expect(
      regulatoryCostMicroUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, "gpt-5-mini"),
    ).toBe(1_125_000);
  });

  it("prices the triage model off its own rates, not the drafting model's", () => {
    process.env["OPENAI_REGULATORY_SERVICE_TIER"] = "default";
    expect(regulatoryTriageModel()).toBe("gpt-5-nano");
    expect(
      regulatoryCostMicroUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, "gpt-5-nano"),
    ).toBe(450_000);
  });

  it("lets the per-mtok overrides retune the primary model without touching triage", () => {
    process.env["OPENAI_REGULATORY_SERVICE_TIER"] = "default";
    process.env["OPENAI_REGULATORY_INPUT_USD_PER_MTOK"] = "1";
    expect(regulatoryModelRates("gpt-5-mini").inputUsdPerMTok).toBe(1);
    expect(regulatoryModelRates("gpt-5-nano").inputUsdPerMTok).toBe(0.05);
  });

  it("pins each run stage to its own prompt cache prefix and drops output verbosity", () => {
    delete process.env["OPENAI_REGULATORY_SERVICE_TIER"];
    expect(
      regulatoryProviderOptions({ reasoningEffort: "minimal", promptCacheKey: "regulatory:run-1" }),
    ).toEqual({
      openai: {
        store: false,
        reasoningEffort: "minimal",
        serviceTier: "flex",
        textVerbosity: "low",
        promptCacheKey: "regulatory:run-1",
        promptCacheRetention: "24h",
      },
    });
  });

  it("routes verification to its own model without touching drafting", () => {
    expect(regulatoryVerificationModel()).toBe("gpt-5-nano");
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

  it("spreads retries over a random window without ever waiting less than the base delay", () => {
    // Concurrent lanes (classification, triage batches, retrieval queries) that all hit a 429 or
    // budget contention at the same instant would otherwise retry at an identical fixed delay and
    // collide again on the next attempt. Jitter only ever adds to the base delay — it must never
    // shorten a provider-specified backoff, or the retry would be rate-limited again for sure.
    const samples = Array.from({ length: 200 }, () => jitteredDelay(5_000, 2_000));
    for (const sample of samples) {
      expect(sample).toBeGreaterThanOrEqual(5_000);
      expect(sample).toBeLessThanOrEqual(7_000);
    }
    expect(new Set(samples).size).toBeGreaterThan(1);
    expect(jitteredDelay(5_000, 0)).toBe(5_000);
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

  it("retries past reservations held by in-flight peers and succeeds once they settle", async () => {
    vi.useFakeTimers();
    try {
      const processor = new RegulatoryAnalysisProcessor();
      const prompt = { system: "system", context: "context" };
      const maxOutputTokens = 12_000;
      const model = "gpt-5-mini";
      const reservedMicroUsd = computeCallCost(
        { inputTokens: conservativeInputTokens(prompt), outputTokens: maxOutputTokens },
        model,
      );
      const budgetMicroUsd = reservedMicroUsd + 1_000;
      // First attempt: a peer's reservation alone pushes this call over budget, but spend by
      // itself would still leave room — CONTENDED, not EXHAUSTED, so the reserve should retry
      // rather than give up.
      const contended = {
        status: "RUNNING",
        budgetMicroUsd,
        spentMicroUsd: 0,
        reservedMicroUsd: budgetMicroUsd,
      };
      // Second attempt: the peer settled and freed its reservation.
      const clear = { status: "RUNNING", budgetMicroUsd, spentMicroUsd: 0, reservedMicroUsd: 0 };
      const create = vi.fn().mockResolvedValue({ id: "call-1" });
      const runUpdate = vi.fn().mockResolvedValue({});
      const queryRaw = vi.fn().mockResolvedValueOnce([contended]).mockResolvedValueOnce([clear]);
      const transactionClient = {
        $queryRaw: queryRaw,
        regulatoryAnalysisRun: { update: runUpdate },
        regulatoryModelCall: { create },
      };
      (processor as unknown as { database: object }).database = {
        $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
          callback(transactionClient),
        ),
      };
      const reserve = (
        processor as unknown as {
          reserveModelCall(
            input: Record<string, unknown>,
          ): Promise<{ id: string; reservedMicroUsd: number }>;
        }
      ).reserveModelCall.bind(processor);

      const pending = reserve({
        runId: "run-1",
        provisionId: "article-1",
        clarificationRevision: 0,
        stage: "drafting",
        attempt: 1,
        model,
        prompt,
        maxOutputTokens,
      });
      // Lets the first CONTENDED attempt run, then fast-forwards past its backoff (base delay
      // plus the full jitter window, since the actual sleep is randomized) so the retry fires
      // without the test actually waiting real seconds.
      await vi.advanceTimersByTimeAsync(7_000);
      const reservation = await pending;

      expect(reservation).toEqual({ id: "call-1", model, reservedMicroUsd });
      expect(queryRaw).toHaveBeenCalledTimes(2);
      expect(create).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up once contention outlasts every retry, without ever finding room to spend", async () => {
    vi.useFakeTimers();
    try {
      const processor = new RegulatoryAnalysisProcessor();
      const prompt = { system: "system", context: "context" };
      const maxOutputTokens = 12_000;
      const model = "gpt-5-mini";
      const reservedMicroUsd = computeCallCost(
        { inputTokens: conservativeInputTokens(prompt), outputTokens: maxOutputTokens },
        model,
      );
      const budgetMicroUsd = reservedMicroUsd + 1_000;
      // Always contended, never exhausted by spend alone: a saturated but genuinely solvent run.
      const contended = {
        status: "RUNNING",
        budgetMicroUsd,
        spentMicroUsd: 0,
        reservedMicroUsd: budgetMicroUsd,
      };
      const create = vi.fn();
      const queryRaw = vi.fn().mockResolvedValue([contended]);
      const transactionClient = {
        $queryRaw: queryRaw,
        regulatoryAnalysisRun: { update: vi.fn().mockResolvedValue({}) },
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

      const pending = reserve({
        runId: "run-1",
        provisionId: "article-1",
        clarificationRevision: 0,
        stage: "drafting",
        attempt: 1,
        model,
        prompt,
        maxOutputTokens,
      });
      const assertion = expect(pending).rejects.toThrow("budget is exhausted");
      // BUDGET_CONTENTION_MAX_ATTEMPTS is 6, each attempt separated by a jittered ~5-7s backoff.
      await vi.advanceTimersByTimeAsync(6 * 7_000);
      await assertion;
      expect(queryRaw).toHaveBeenCalledTimes(6);
      expect(create).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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

  it("accepts a requirement extracted verbatim from its source", () => {
    const source =
      "L’organisme doit déterminer surveiller revoir et mettre à jour les informations nécessaires afin de maîtriser durablement tous les processus opérationnels pertinents pour assurer la conformité constante des produits et services fournis aux clients concernés.";
    expect(validateRequirementDraft(source, source, [source.slice(0, 80)])).toEqual([]);
  });

  it("rejects inputs that would be truncated", () => {
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
