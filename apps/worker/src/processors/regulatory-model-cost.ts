import { languageProviderOptions, llmSettings } from "@qhse/ai";
import { findModelDefinition, type LanguageProvider, type LlmReasoningEffort } from "@qhse/config";

// The Responses API scaffolding plus the structured-output JSON schema. The largest schema this
// pipeline sends (classification) serializes to ~1.1KB / ~350 tokens, so this is several times
// the real fixed cost and still a rounding error next to the prompt itself.
const CONSERVATIVE_PROMPT_OVERHEAD_TOKENS = 2_048;

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

export function positiveNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name] ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function regulatoryServiceTier(): RegulatoryServiceTier {
  return llmSettings().regulatoryServiceTier;
}

export function regulatoryPrimaryModel(): string {
  return llmSettings().regulatoryModel;
}

export function regulatoryPrimaryProvider(): LanguageProvider {
  return llmSettings().regulatoryProvider;
}

// Verification is a containment check that only ever runs after validateRequirementDraft has
// proven every excerpt is a verbatim substring and isVerbatimRequirement has proven the wording
// is not a straight quote. What is left is "does this wording overreach the source", which is a
// comparison, not a drafting task. Its failure direction is also safe: a weaker model that is
// unsure answers unsupported, which routes the candidate to human review rather than publishing
// something unverified.
export function regulatoryVerificationModel(): string {
  return llmSettings().regulatoryVerificationModel;
}

export function regulatoryVerificationProvider(): LanguageProvider {
  return llmSettings().regulatoryVerificationProvider;
}

// Rates are per-model because verification may use a cheaper model than drafting. The configured
// rates predate the second model and name the primary model's rates, so they only override that
// model's entry.
function configuredProvider(model: string): LanguageProvider {
  const settings = llmSettings();
  if (model === settings.regulatoryVerificationModel)
    return settings.regulatoryVerificationProvider;
  return settings.regulatoryProvider;
}

export function regulatoryModelRates(
  model: string,
  provider: LanguageProvider = configuredProvider(model),
): RegulatoryModelRates {
  const settings = llmSettings();
  const definition = findModelDefinition(provider, model, settings.customModels);
  if (!definition?.rates) {
    throw new Error(`No regulatory price metadata for ${provider}:${model}`);
  }
  const listed = definition.rates;
  const base =
    provider === settings.regulatoryProvider && model === settings.regulatoryModel
      ? {
          inputUsdPerMTok: settings.regulatoryInputUsdPerMTok ?? listed.inputUsdPerMTok,
          cachedInputUsdPerMTok:
            settings.regulatoryCachedInputUsdPerMTok ?? listed.cachedInputUsdPerMTok,
          outputUsdPerMTok: settings.regulatoryOutputUsdPerMTok ?? listed.outputUsdPerMTok,
        }
      : listed;
  if (provider !== "openai" || settings.regulatoryServiceTier !== "flex") return base;
  const multiplier = settings.regulatoryFlexRateMultiplier;
  return {
    inputUsdPerMTok: base.inputUsdPerMTok * multiplier,
    cachedInputUsdPerMTok: base.cachedInputUsdPerMTok * multiplier,
    outputUsdPerMTok: base.outputUsdPerMTok * multiplier,
  };
}

export function regulatoryCostMicroUsd(
  usage: RegulatoryTokenUsage,
  model: string,
  provider: LanguageProvider = configuredProvider(model),
): number {
  const rates = regulatoryModelRates(model, provider);
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
  provider?: LanguageProvider;
  model?: string;
  reasoningEffort: LlmReasoningEffort;
  promptCacheKey: string;
}): ReturnType<typeof languageProviderOptions> {
  return languageProviderOptions(input.provider ?? regulatoryPrimaryProvider(), input);
}

export function conservativeInputTokens(prompt: { system: string; context: string }): number {
  const bytes =
    Buffer.byteLength(prompt.system, "utf8") + Buffer.byteLength(prompt.context, "utf8");
  return (
    Math.ceil(bytes / llmSettings().conservativeBytesPerToken) + CONSERVATIVE_PROMPT_OVERHEAD_TOKENS
  );
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
