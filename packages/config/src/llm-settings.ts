import { z } from "zod";

// The LLM configuration used to live only in the process environment, which meant a model or a
// price change needed a redeploy of three services. It is now a single database row that the
// admin workspace edits, layered on top of the environment: an unset override falls back to the
// environment variable, and an unset variable falls back to the built-in default. Deployments
// that never touch the admin tab keep behaving exactly as they did.

export const llmServiceTiers = ["auto", "default", "flex", "priority"] as const;
export const llmTextVerbosities = ["low", "medium", "high"] as const;
export const llmPromptCacheRetentions = ["in_memory", "24h"] as const;
// The gpt-5 family accepts exactly these four. "none", "xhigh" and "max" belong to later model
// generations and are rejected outright — sending one costs a full run before it fails, so they
// are not offered here. legacyReasoningEffort maps the old names onto the nearest supported one.
export const llmReasoningEfforts = ["minimal", "low", "medium", "high"] as const;

const modelName = z.string().trim().min(1).max(120);

export const llmSettingsSchema = z.object({
  ragEnabled: z.boolean(),
  profileModel: modelName,
  transcriptionModel: modelName,
  regulatoryModel: modelName,
  regulatoryTriageModel: modelName,
  regulatoryVerificationModel: modelName,
  regulatoryServiceTier: z.enum(llmServiceTiers),
  regulatoryTextVerbosity: z.enum(llmTextVerbosities),
  regulatoryPromptCacheRetention: z.enum(llmPromptCacheRetentions),
  regulatoryReasoningEffort: z.enum(llmReasoningEfforts),
  regulatoryTimeoutMs: z.number().int().positive().max(600_000),
  regulatoryDraftMaxOutputTokens: z.number().int().positive().max(200_000),
  regulatoryVerificationMaxOutputTokens: z.number().int().positive().max(200_000),
  regulatoryTriageMaxOutputTokens: z.number().int().positive().max(200_000),
  regulatoryRunBudgetUsd: z.number().positive().max(1_000),
  regulatoryEvaluationBudgetUsd: z.number().positive().max(1_000),
  // The three per-token rates default to "unset", which means the published rate for whichever
  // model is configured. Pinning them is for the case where the provider's price list has moved
  // and the deployment needs the budget arithmetic corrected before this code is updated.
  regulatoryInputUsdPerMTok: z.number().positive().max(1_000).nullable(),
  regulatoryCachedInputUsdPerMTok: z.number().positive().max(1_000).nullable(),
  regulatoryOutputUsdPerMTok: z.number().positive().max(1_000).nullable(),
  regulatoryFlexRateMultiplier: z.number().positive().max(10),
  conservativeBytesPerToken: z.number().positive().max(100),
  triageIncludeUnsure: z.boolean(),
});

export type LlmSettings = z.infer<typeof llmSettingsSchema>;
export type LlmReasoningEffort = (typeof llmReasoningEfforts)[number];
export type LlmSettingsKey = keyof LlmSettings;

/** A stored override omits the fields the administrator has not taken over, and uses `null` to
 * hand a field back to the environment. */
export const llmSettingsOverrideSchema = z
  .object(
    Object.fromEntries(
      Object.entries(llmSettingsSchema.shape).map(([key, schema]) => [
        key,
        schema.nullable().optional(),
      ]),
    ) as {
      [Key in LlmSettingsKey]: z.ZodOptional<z.ZodNullable<(typeof llmSettingsSchema.shape)[Key]>>;
    },
  )
  .strict();

export type LlmSettingsOverrides = z.infer<typeof llmSettingsOverrideSchema>;

export const llmSettingsDefaults: LlmSettings = {
  ragEnabled: false,
  profileModel: "gpt-5-mini",
  transcriptionModel: "gpt-4o-mini-transcribe",
  regulatoryModel: "gpt-5-mini",
  regulatoryTriageModel: "gpt-5-nano",
  regulatoryVerificationModel: "gpt-5-nano",
  regulatoryServiceTier: "flex",
  regulatoryTextVerbosity: "low",
  regulatoryPromptCacheRetention: "24h",
  regulatoryReasoningEffort: "low",
  regulatoryTimeoutMs: 180_000,
  regulatoryDraftMaxOutputTokens: 12_000,
  // Even "minimal" reasoning effort — the floor the gpt-5 family accepts, since "none" doesn't
  // exist — still spends some of this ceiling on hidden reasoning tokens before the schema's
  // actual output (a boolean and a short array, or a page of YES/NO/UNSURE decisions). Too little
  // headroom here surfaces as NoOutputGeneratedError: the model reasoned through the whole budget
  // and never got to emit the answer.
  regulatoryVerificationMaxOutputTokens: 10_000,
  regulatoryTriageMaxOutputTokens: 4_000,
  regulatoryRunBudgetUsd: 1,
  regulatoryEvaluationBudgetUsd: 10,
  regulatoryInputUsdPerMTok: null,
  regulatoryCachedInputUsdPerMTok: null,
  regulatoryOutputUsdPerMTok: null,
  regulatoryFlexRateMultiplier: 0.5,
  conservativeBytesPerToken: 2,
  triageIncludeUnsure: true,
};

/** The environment variable each field falls back to. Kept explicit so the admin tab and the
 * `.env` file stay describable by the same table. */
export const llmSettingsEnvironmentKeys: Record<LlmSettingsKey, string> = {
  ragEnabled: "NORMATIVE_RAG_ENABLED",
  profileModel: "OPENAI_PROFILE_MODEL",
  transcriptionModel: "OPENAI_TRANSCRIPTION_MODEL",
  regulatoryModel: "OPENAI_REGULATORY_MODEL",
  regulatoryTriageModel: "OPENAI_REGULATORY_TRIAGE_MODEL",
  regulatoryVerificationModel: "OPENAI_REGULATORY_VERIFICATION_MODEL",
  regulatoryServiceTier: "OPENAI_REGULATORY_SERVICE_TIER",
  regulatoryTextVerbosity: "OPENAI_REGULATORY_TEXT_VERBOSITY",
  regulatoryPromptCacheRetention: "OPENAI_REGULATORY_PROMPT_CACHE_RETENTION",
  regulatoryReasoningEffort: "OPENAI_REGULATORY_REASONING_EFFORT",
  regulatoryTimeoutMs: "OPENAI_REGULATORY_TIMEOUT_MS",
  regulatoryDraftMaxOutputTokens: "OPENAI_REGULATORY_DRAFT_MAX_OUTPUT_TOKENS",
  regulatoryVerificationMaxOutputTokens: "OPENAI_REGULATORY_VERIFICATION_MAX_OUTPUT_TOKENS",
  regulatoryTriageMaxOutputTokens: "OPENAI_REGULATORY_TRIAGE_MAX_OUTPUT_TOKENS",
  regulatoryRunBudgetUsd: "OPENAI_REGULATORY_RUN_BUDGET_USD",
  regulatoryEvaluationBudgetUsd: "REGULATORY_EVALUATION_BUDGET_USD",
  regulatoryInputUsdPerMTok: "OPENAI_REGULATORY_INPUT_USD_PER_MTOK",
  regulatoryCachedInputUsdPerMTok: "OPENAI_REGULATORY_CACHED_INPUT_USD_PER_MTOK",
  regulatoryOutputUsdPerMTok: "OPENAI_REGULATORY_OUTPUT_USD_PER_MTOK",
  regulatoryFlexRateMultiplier: "OPENAI_REGULATORY_FLEX_RATE_MULTIPLIER",
  conservativeBytesPerToken: "REGULATORY_CONSERVATIVE_BYTES_PER_TOKEN",
  triageIncludeUnsure: "REGULATORY_TRIAGE_INCLUDE_UNSURE",
};

export const llmApiKeyEnvironmentKey = "OPENAI_API_KEY";

type Environment = Record<string, string | undefined>;

/** Reads the environment layer. A variable that fails the field's own validation is ignored
 * rather than fatal: a typo in one price must not take the whole pipeline down. */
export function llmSettingsFromEnvironment(environment: Environment): LlmSettings {
  const resolved = { ...llmSettingsDefaults };
  for (const [key, schema] of Object.entries(llmSettingsSchema.shape)) {
    const raw = environment[llmSettingsEnvironmentKeys[key as LlmSettingsKey]];
    if (raw === undefined || raw === "") continue;
    // Environment variables are strings; the field's own schema decides which reading of the
    // string it accepts, so no second table of per-field types has to be kept in step.
    for (const candidate of [raw, Number(raw), raw === "true"]) {
      const parsed = schema.safeParse(candidate);
      if (parsed.success) {
        Object.assign(resolved, { [key]: parsed.data });
        break;
      }
    }
  }
  return applyLegacyKeys(resolved, environment);
}

const legacyReasoningEfforts: Record<string, (typeof llmReasoningEfforts)[number]> = {
  none: "minimal",
  xhigh: "high",
  max: "high",
};

/** REGULATORY_EVALUATION_BUDGET_MICRO_USD predates the USD-denominated setting and is still
 * honoured, so an existing deployment keeps the ceiling it configured. The newer USD variable
 * wins when both are present. */
function applyLegacyKeys(resolved: LlmSettings, environment: Environment): LlmSettings {
  const microUsd = Number(environment["REGULATORY_EVALUATION_BUDGET_MICRO_USD"]);
  if (
    environment[llmSettingsEnvironmentKeys.regulatoryEvaluationBudgetUsd] === undefined &&
    Number.isFinite(microUsd) &&
    microUsd > 0
  ) {
    const parsed = llmSettingsSchema.shape.regulatoryEvaluationBudgetUsd.safeParse(
      microUsd / 1_000_000,
    );
    if (parsed.success) resolved.regulatoryEvaluationBudgetUsd = parsed.data;
  }

  const effort = environment[llmSettingsEnvironmentKeys.regulatoryReasoningEffort];
  const mapped = effort ? legacyReasoningEfforts[effort] : undefined;
  if (mapped) resolved.regulatoryReasoningEffort = mapped;

  return resolved;
}

export function resolveLlmSettings(
  overrides: LlmSettingsOverrides | null | undefined,
  environment: Environment,
): LlmSettings {
  const resolved = llmSettingsFromEnvironment(environment);
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === null || value === undefined) continue;
    Object.assign(resolved, { [key]: value });
  }
  return resolved;
}
