import { z } from "zod";

export const languageProviders = ["openai", "anthropic", "google"] as const;
export const embeddingProviders = ["openai", "google"] as const;
export const languageProviderSchema = z.enum(languageProviders);
export const embeddingProviderSchema = z.enum(embeddingProviders);

export type LanguageProvider = (typeof languageProviders)[number];
export type EmbeddingProvider = (typeof embeddingProviders)[number];
export type AiProvider = LanguageProvider;

export const modelCapabilitiesSchema = z.object({
  language: z.boolean().default(false),
  embedding: z.boolean().default(false),
  structuredOutput: z.boolean().default(false),
  tools: z.boolean().default(false),
  webSearch: z.boolean().default(false),
  fileInput: z.boolean().default(false),
});

export const modelRatesSchema = z.object({
  inputUsdPerMTok: z.number().positive().max(1_000),
  cachedInputUsdPerMTok: z.number().nonnegative().max(1_000),
  outputUsdPerMTok: z.number().positive().max(1_000),
});

export const modelAdvancedControlSchema = z.enum([
  "reasoningEffort",
  "serviceTier",
  "verbosity",
  "cacheRetention",
  "anthropicEffort",
  "anthropicSpeed",
  "thinkingLevel",
  "thinkingBudget",
]);

export const customModelDefinitionSchema = z.object({
  provider: languageProviderSchema,
  model: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
  capabilities: modelCapabilitiesSchema,
  advancedControls: z.array(modelAdvancedControlSchema).default([]),
  rates: modelRatesSchema.nullable().default(null),
});

export type ModelCapabilities = z.infer<typeof modelCapabilitiesSchema>;
export type ModelRates = z.infer<typeof modelRatesSchema>;
export type CustomModelDefinition = z.infer<typeof customModelDefinitionSchema>;

export type TestedModelDefinition = CustomModelDefinition & {
  tested: true;
  pricingSource: string | null;
  pricingVerifiedAt: string | null;
  defaultDimensions?: number;
};

const language = {
  language: true,
  embedding: false,
  structuredOutput: true,
  tools: true,
  webSearch: true,
  fileInput: true,
} satisfies ModelCapabilities;

const embedding = {
  language: false,
  embedding: true,
  structuredOutput: false,
  tools: false,
  webSearch: false,
  fileInput: false,
} satisfies ModelCapabilities;

/**
 * Models exercised by this platform. Rates are deliberately pinned rather than fetched at
 * runtime: the regulatory reservation is a safety ceiling and must be deterministic. Update the
 * verification date and source together whenever a rate changes.
 */
export const testedModelCatalog: readonly TestedModelDefinition[] = [
  {
    provider: "openai",
    model: "gpt-5",
    label: "GPT-5",
    capabilities: language,
    advancedControls: ["reasoningEffort", "serviceTier", "verbosity", "cacheRetention"],
    rates: { inputUsdPerMTok: 1.25, cachedInputUsdPerMTok: 0.125, outputUsdPerMTok: 10 },
    tested: true,
    pricingSource: "https://platform.openai.com/docs/pricing",
    pricingVerifiedAt: "2026-09-06",
  },
  {
    provider: "openai",
    model: "gpt-5-mini",
    label: "GPT-5 mini",
    capabilities: language,
    advancedControls: ["reasoningEffort", "serviceTier", "verbosity", "cacheRetention"],
    rates: { inputUsdPerMTok: 0.25, cachedInputUsdPerMTok: 0.025, outputUsdPerMTok: 2 },
    tested: true,
    pricingSource: "https://platform.openai.com/docs/pricing",
    pricingVerifiedAt: "2026-09-06",
  },
  {
    provider: "openai",
    model: "gpt-5-nano",
    label: "GPT-5 nano",
    capabilities: language,
    advancedControls: ["reasoningEffort", "serviceTier", "verbosity", "cacheRetention"],
    rates: { inputUsdPerMTok: 0.05, cachedInputUsdPerMTok: 0.005, outputUsdPerMTok: 0.4 },
    tested: true,
    pricingSource: "https://platform.openai.com/docs/pricing",
    pricingVerifiedAt: "2026-09-06",
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    capabilities: language,
    advancedControls: ["anthropicEffort", "anthropicSpeed"],
    rates: { inputUsdPerMTok: 3, cachedInputUsdPerMTok: 0.3, outputUsdPerMTok: 15 },
    tested: true,
    pricingSource: "https://docs.anthropic.com/en/docs/about-claude/pricing",
    pricingVerifiedAt: "2026-09-06",
  },
  {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    capabilities: language,
    advancedControls: ["anthropicEffort", "anthropicSpeed"],
    rates: { inputUsdPerMTok: 1, cachedInputUsdPerMTok: 0.1, outputUsdPerMTok: 5 },
    tested: true,
    pricingSource: "https://docs.anthropic.com/en/docs/about-claude/pricing",
    pricingVerifiedAt: "2026-09-06",
  },
  {
    provider: "google",
    model: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    capabilities: language,
    advancedControls: ["thinkingBudget"],
    // The conservative >200k-input tier prevents a long regulatory prompt being under-reserved.
    rates: { inputUsdPerMTok: 2.5, cachedInputUsdPerMTok: 0.625, outputUsdPerMTok: 15 },
    tested: true,
    pricingSource: "https://ai.google.dev/gemini-api/docs/pricing",
    pricingVerifiedAt: "2026-09-06",
  },
  {
    provider: "google",
    model: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    capabilities: language,
    advancedControls: ["thinkingLevel"],
    rates: { inputUsdPerMTok: 0.75, cachedInputUsdPerMTok: 0.075, outputUsdPerMTok: 3.75 },
    tested: true,
    pricingSource: "https://ai.google.dev/gemini-api/docs/pricing",
    pricingVerifiedAt: "2026-09-08",
  },
  {
    provider: "openai",
    model: "text-embedding-3-small",
    label: "OpenAI text-embedding-3-small",
    capabilities: embedding,
    advancedControls: [],
    rates: null,
    tested: true,
    pricingSource: null,
    pricingVerifiedAt: null,
    defaultDimensions: 1_536,
  },
  {
    provider: "google",
    model: "gemini-embedding-001",
    label: "Gemini Embedding 001",
    capabilities: embedding,
    advancedControls: [],
    rates: null,
    tested: true,
    pricingSource: null,
    pricingVerifiedAt: null,
    defaultDimensions: 3_072,
  },
] as const;

export function modelCatalog(
  customModels: readonly CustomModelDefinition[] = [],
): readonly (TestedModelDefinition | (CustomModelDefinition & { tested: false }))[] {
  return [
    ...testedModelCatalog,
    ...customModels.map((model) => ({ ...model, tested: false as const })),
  ];
}

export function findModelDefinition(
  provider: AiProvider,
  model: string,
  customModels: readonly CustomModelDefinition[] = [],
) {
  return modelCatalog(customModels).find(
    (definition) => definition.provider === provider && definition.model === model,
  );
}

export function qualifiedModel(provider: AiProvider, model: string): string {
  return `${provider}:${model}`;
}
