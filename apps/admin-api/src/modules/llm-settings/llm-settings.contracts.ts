import {
  anthropicEfforts,
  anthropicSpeeds,
  embeddingProviders,
  googleThinkingLevels,
  languageProviders,
  llmPromptCacheRetentions,
  llmReasoningEfforts,
  llmServiceTiers,
  llmSettingsEnvironmentKeys,
  llmSettingsOverrideSchema,
  llmTextVerbosities,
  type LlmSettings,
  type LlmSettingsKey,
  type LlmSettingsOverrides,
  type AiProvider,
  type CustomModelDefinition,
} from "@qhse/config";
import { z } from "zod";

export {
  llmPromptCacheRetentions,
  llmReasoningEfforts,
  llmServiceTiers,
  llmSettingsEnvironmentKeys,
  llmTextVerbosities,
  languageProviders,
  embeddingProviders,
  anthropicEfforts,
  anthropicSpeeds,
  googleThinkingLevels,
};

/** An empty string clears the stored key and hands the API key back to the environment; omitting
 * the field leaves whatever is stored untouched, so the form can be saved without retyping it. */
export const updateLlmSettingsSchema = llmSettingsOverrideSchema
  .extend({
    apiKey: z.string().trim().max(400).nullable().optional(),
    apiKeys: z
      .object({
        openai: z.string().trim().max(400).nullable().optional(),
        anthropic: z.string().trim().max(400).nullable().optional(),
        google: z.string().trim().max(400).nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export type UpdateLlmSettingsInput = z.infer<typeof updateLlmSettingsSchema>;

export type LlmSettingsView = {
  /** What the platform actually uses right now: overrides layered on the environment. */
  effective: LlmSettings;
  /** Only the fields an administrator has taken over. */
  overrides: LlmSettingsOverrides;
  /** The environment layer on its own, so the tab can show what a reset would fall back to. */
  environmentDefaults: LlmSettings;
  environmentKeys: Record<LlmSettingsKey, string>;
  credentials: Record<
    AiProvider,
    {
      configured: boolean;
      source: "database" | "environment" | "none";
      preview: string | null;
    }
  >;
  /** @deprecated OpenAI compatibility alias. */
  apiKey: {
    configured: boolean;
    source: "database" | "environment" | "none";
    preview: string | null;
  };
  catalog: readonly (CustomModelDefinition & {
    tested: boolean;
    pricingSource?: string | null;
    pricingVerifiedAt?: string | null;
    defaultDimensions?: number;
  })[];
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
};

export const providerHealthCheckSchema = z.object({
  capability: z.enum(["language", "embedding"]),
  model: z.string().trim().min(1).max(120),
});
export type ProviderHealthCheckInput = z.infer<typeof providerHealthCheckSchema>;

export type ProviderHealthCheckResult = {
  ok: boolean;
  provider: AiProvider;
  capability: "language" | "embedding";
  model: string;
  latencyMs: number;
  error: string | null;
};
