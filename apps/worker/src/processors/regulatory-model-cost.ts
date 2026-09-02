// The Responses API scaffolding plus the structured-output JSON schema. The largest schema this
// pipeline sends (classification) serializes to ~1.1KB / ~350 tokens, so this is several times
// the real fixed cost and still a rounding error next to the prompt itself.
const CONSERVATIVE_PROMPT_OVERHEAD_TOKENS = 2_048;

// Reservations must bound the real token count from above or the run budget stops being a cap,
// so this divides UTF-8 bytes by the *worst* density the corpus can produce rather than the
// average. French provisions run around 3.5 bytes per token, but the corpus is fr + ar, and
// Arabic is 2 bytes per character before tokenization — so 2 stays above the real count for both
// languages instead of quietly under-reserving every Arabic provision.
const CONSERVATIVE_BYTES_PER_TOKEN = 2;

// OpenAI's flex service tier bills the gpt-5 family at half the standard rate in exchange for
// slower, best-effort scheduling. The regulatory processors are background BullMQ workers with
// a 180s timeout and a rate-limit retry loop, so the latency is free and the discount is not.
// If OpenAI changes the flex discount, override it rather than editing this constant.
const FLEX_RATE_MULTIPLIER = 0.5;

export type RegulatoryServiceTier = "auto" | "default" | "flex" | "priority";

export type RegulatoryModelRates = {
  inputUsdPerMTok: number;
  cachedInputUsdPerMTok: number;
  outputUsdPerMTok: number;
};

export type RegulatoryTokenUsage = {
  inputTokens: number;
  // The subset of inputTokens served from a prompt cache prefix. OpenAI reports it inside
  // inputTokens, so it is subtracted out and billed at the cached rate instead of dropped.
  cachedInputTokens?: number;
  outputTokens: number;
};

const MODEL_RATES: Record<string, RegulatoryModelRates> = {
  "gpt-5": { inputUsdPerMTok: 1.25, cachedInputUsdPerMTok: 0.125, outputUsdPerMTok: 10 },
  "gpt-5-mini": { inputUsdPerMTok: 0.25, cachedInputUsdPerMTok: 0.025, outputUsdPerMTok: 2 },
  "gpt-5-nano": { inputUsdPerMTok: 0.05, cachedInputUsdPerMTok: 0.005, outputUsdPerMTok: 0.4 },
};

const FALLBACK_RATES: RegulatoryModelRates = MODEL_RATES["gpt-5-mini"]!;

export function positiveNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name] ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function regulatoryServiceTier(): RegulatoryServiceTier {
  const configured = process.env["OPENAI_REGULATORY_SERVICE_TIER"];
  return configured === "auto" || configured === "default" || configured === "priority"
    ? configured
    : "flex";
}

export function regulatoryPrimaryModel(): string {
  return process.env["OPENAI_REGULATORY_MODEL"] ?? "gpt-5-mini";
}

export function regulatoryTriageModel(): string {
  return process.env["OPENAI_REGULATORY_TRIAGE_MODEL"] ?? "gpt-5-nano";
}

// Verification is a containment check that only ever runs after validateRequirementDraft has
// proven every excerpt is a verbatim substring and isVerbatimRequirement has proven the wording
// is not a straight quote. What is left is "does this wording overreach the source", which is a
// comparison, not a drafting task. Its failure direction is also safe: a weaker model that is
// unsure answers unsupported, which routes the candidate to human review rather than publishing
// something unverified.
export function regulatoryVerificationModel(): string {
  return process.env["OPENAI_REGULATORY_VERIFICATION_MODEL"] ?? "gpt-5-nano";
}

// Rates are per-model because triage runs on a cheaper model than drafting: billing every stage
// at the primary model's rate would charge triage ~5x what it costs and exhaust the run budget
// against spend that never happened. The OPENAI_REGULATORY_*_USD_PER_MTOK variables predate the
// second model and name the primary model's rates, so they only override that model's entry.
export function regulatoryModelRates(model: string): RegulatoryModelRates {
  const listed = MODEL_RATES[model] ?? FALLBACK_RATES;
  const base =
    model === regulatoryPrimaryModel()
      ? {
          inputUsdPerMTok: positiveNumber(
            "OPENAI_REGULATORY_INPUT_USD_PER_MTOK",
            listed.inputUsdPerMTok,
          ),
          cachedInputUsdPerMTok: positiveNumber(
            "OPENAI_REGULATORY_CACHED_INPUT_USD_PER_MTOK",
            listed.cachedInputUsdPerMTok,
          ),
          outputUsdPerMTok: positiveNumber(
            "OPENAI_REGULATORY_OUTPUT_USD_PER_MTOK",
            listed.outputUsdPerMTok,
          ),
        }
      : listed;
  if (regulatoryServiceTier() !== "flex") return base;
  const multiplier = positiveNumber("OPENAI_REGULATORY_FLEX_RATE_MULTIPLIER", FLEX_RATE_MULTIPLIER);
  return {
    inputUsdPerMTok: base.inputUsdPerMTok * multiplier,
    cachedInputUsdPerMTok: base.cachedInputUsdPerMTok * multiplier,
    outputUsdPerMTok: base.outputUsdPerMTok * multiplier,
  };
}

export function regulatoryCostMicroUsd(usage: RegulatoryTokenUsage, model: string): number {
  const rates = regulatoryModelRates(model);
  const cachedInputTokens = Math.min(Math.max(usage.cachedInputTokens ?? 0, 0), usage.inputTokens);
  const freshInputTokens = usage.inputTokens - cachedInputTokens;
  return Math.ceil(
    freshInputTokens * rates.inputUsdPerMTok +
      cachedInputTokens * rates.cachedInputUsdPerMTok +
      usage.outputTokens * rates.outputUsdPerMTok,
  );
}

// Provider options shared by every regulatory model call. promptCacheKey pins each run's calls
// to one cache prefix: the system prompt plus the run's profile snapshot is identical across
// every candidate, so explicit keying turns best-effort implicit caching into reliable hits.
export function regulatoryProviderOptions(input: {
  reasoningEffort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  promptCacheKey: string;
}): {
  openai: {
    store: boolean;
    reasoningEffort: string;
    serviceTier: RegulatoryServiceTier;
    textVerbosity: string;
    promptCacheKey: string;
    promptCacheRetention: string;
  };
} {
  return {
    openai: {
      store: false,
      reasoningEffort: input.reasoningEffort,
      serviceTier: regulatoryServiceTier(),
      // Output tokens cost 8x input tokens, and every schema field this pipeline asks for is
      // short by contract (2-4 sentence rationale, 1-3 verbatim excerpts).
      textVerbosity: process.env["OPENAI_REGULATORY_TEXT_VERBOSITY"] ?? "low",
      promptCacheKey: input.promptCacheKey,
      promptCacheRetention: process.env["OPENAI_REGULATORY_PROMPT_CACHE_RETENTION"] ?? "24h",
    },
  };
}

export function conservativeInputTokens(prompt: { system: string; context: string }): number {
  const bytes =
    Buffer.byteLength(prompt.system, "utf8") + Buffer.byteLength(prompt.context, "utf8");
  const bytesPerToken = positiveNumber(
    "REGULATORY_CONSERVATIVE_BYTES_PER_TOKEN",
    CONSERVATIVE_BYTES_PER_TOKEN,
  );
  return Math.ceil(bytes / bytesPerToken) + CONSERVATIVE_PROMPT_OVERHEAD_TOKENS;
}

// A failed call still burned tokens, so it still has to be charged against the run budget. The
// SDK attaches the real usage to the failures it can account for — a response that arrived but
// did not match the output schema being the clear case — and charging that instead of the
// conservative reservation stops one malformed response from costing a run several percent of
// its ceiling. Failures that carry no usage (timeouts we aborted, transport errors) keep the
// full reservation, because there the tokens the provider generated are genuinely unknown.
export function failureUsage(error: unknown): RegulatoryTokenUsage | null {
  if (!error || typeof error !== "object") return null;
  const usage = (error as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return null;
  const { inputTokens, outputTokens, inputTokenDetails } = usage as {
    inputTokens?: unknown;
    outputTokens?: unknown;
    inputTokenDetails?: { cacheReadTokens?: unknown };
  };
  if (typeof inputTokens !== "number" || !Number.isFinite(inputTokens)) return null;
  const cacheReadTokens = inputTokenDetails?.cacheReadTokens;
  return {
    inputTokens,
    cachedInputTokens: typeof cacheReadTokens === "number" ? cacheReadTokens : 0,
    outputTokens:
      typeof outputTokens === "number" && Number.isFinite(outputTokens) ? outputTokens : 0,
  };
}

export function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /timeout|timed out|abort/iu.test(`${error.name} ${error.message}`);
}
