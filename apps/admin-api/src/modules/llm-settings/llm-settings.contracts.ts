import {
  llmPromptCacheRetentions,
  llmReasoningEfforts,
  llmServiceTiers,
  llmSettingsEnvironmentKeys,
  llmSettingsOverrideSchema,
  llmTextVerbosities,
  type LlmSettings,
  type LlmSettingsKey,
  type LlmSettingsOverrides,
} from "@qhse/config";
import { z } from "zod";

export {
  llmPromptCacheRetentions,
  llmReasoningEfforts,
  llmServiceTiers,
  llmSettingsEnvironmentKeys,
  llmTextVerbosities,
};

/** An empty string clears the stored key and hands the API key back to the environment; omitting
 * the field leaves whatever is stored untouched, so the form can be saved without retyping it. */
export const updateLlmSettingsSchema = llmSettingsOverrideSchema
  .extend({ apiKey: z.string().trim().max(400).nullable().optional() })
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
  apiKey: {
    configured: boolean;
    source: "database" | "environment" | "none";
    preview: string | null;
  };
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
};
