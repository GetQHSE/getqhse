import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LlmSetting } from "@qhse/database";

import { encryptLlmSecret } from "./llm-secret.js";
import {
  configureLlmSettingsLoader,
  llmSettings,
  llmSettingsOverridesFromRecord,
  refreshLlmSettings,
  resetLlmSettingsSnapshot,
} from "./llm-settings-store.js";

const record = (overrides: Partial<LlmSetting> | Record<string, unknown> = {}): LlmSetting => ({
  id: "singleton",
  ragEnabled: null,
  profileProvider: null,
  profileModel: null,
  transcriptionModel: null,
  embeddingProvider: null,
  embeddingModel: null,
  regulatoryProvider: null,
  regulatoryModel: null,
  regulatoryTriageModel: null,
  regulatoryVerificationProvider: null,
  regulatoryVerificationModel: null,
  regulatoryServiceTier: null,
  regulatoryTextVerbosity: null,
  regulatoryPromptCacheRetention: null,
  regulatoryReasoningEffort: null,
  anthropicEffort: null,
  anthropicSpeed: null,
  googleThinkingLevel: null,
  googleThinkingBudget: null,
  regulatoryTimeoutMs: null,
  regulatoryDraftMaxOutputTokens: null,
  regulatoryVerificationMaxOutputTokens: null,
  regulatoryTriageMaxOutputTokens: null,
  regulatoryRunBudgetUsd: null,
  regulatoryEvaluationBudgetUsd: null,
  regulatoryInputUsdPerMTok: null,
  regulatoryCachedInputUsdPerMTok: null,
  regulatoryOutputUsdPerMTok: null,
  regulatoryFlexRateMultiplier: null,
  conservativeBytesPerToken: null,
  triageIncludeUnsure: null,
  customModels: null,
  apiKeyCiphertext: null,
  apiKeyPreview: null,
  anthropicApiKeyCiphertext: null,
  anthropicApiKeyPreview: null,
  googleApiKeyCiphertext: null,
  googleApiKeyPreview: null,
  updatedByUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("llmSettingsOverridesFromRecord", () => {
  it("skips columns that were never overridden", () => {
    expect(llmSettingsOverridesFromRecord(record())).toEqual({});
    expect(llmSettingsOverridesFromRecord(null)).toEqual({});
  });

  it("converts decimal columns back into numbers", () => {
    // Prisma hands Decimal columns back as objects, not numbers.
    const decimal = { toString: () => "2.5" };
    expect(llmSettingsOverridesFromRecord(record({ regulatoryRunBudgetUsd: decimal }))).toEqual({
      regulatoryRunBudgetUsd: 2.5,
    });
  });

  it("drops a stored value that no longer satisfies its schema", () => {
    expect(
      llmSettingsOverridesFromRecord(
        record({ regulatoryServiceTier: "turbo", regulatoryModel: "gpt-5" }),
      ),
    ).toEqual({ regulatoryModel: "gpt-5" });
  });
});

describe("the resolved snapshot", () => {
  beforeEach(() => {
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    resetLlmSettingsSnapshot();
  });

  afterEach(() => {
    configureLlmSettingsLoader(null);
    resetLlmSettingsSnapshot();
    vi.unstubAllEnvs();
  });

  it("reads the environment while no loader is configured", () => {
    vi.stubEnv("OPENAI_REGULATORY_MODEL", "gpt-5");
    vi.stubEnv("OPENAI_API_KEY", "sk-from-env");

    expect(llmSettings().regulatoryModel).toBe("gpt-5");
    expect(llmSettings().apiKey).toBe("sk-from-env");
    expect(llmSettings().apiKeySource).toBe("environment");
  });

  it("resolves independent provider credentials", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-from-env");
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-from-env");
    configureLlmSettingsLoader(async () =>
      record({ googleApiKeyCiphertext: encryptLlmSecret("google-from-database") }),
    );

    await refreshLlmSettings();

    expect(llmSettings().apiKeys).toMatchObject({
      openai: "sk-from-env",
      anthropic: "anthropic-from-env",
      google: "google-from-database",
    });
    expect(llmSettings().apiKeySources).toMatchObject({
      openai: "environment",
      anthropic: "environment",
      google: "database",
    });
  });

  it("prefers the stored row once it has been loaded", async () => {
    vi.stubEnv("OPENAI_REGULATORY_MODEL", "gpt-5");
    configureLlmSettingsLoader(async () => record({ regulatoryModel: "gpt-5-nano" }));

    await refreshLlmSettings();

    expect(llmSettings().regulatoryModel).toBe("gpt-5-nano");
  });

  it("decrypts the stored API key in preference to the environment one", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-from-env");
    configureLlmSettingsLoader(async () =>
      record({ apiKeyCiphertext: encryptLlmSecret("sk-from-database") }),
    );

    await refreshLlmSettings();

    expect(llmSettings().apiKey).toBe("sk-from-database");
    expect(llmSettings().apiKeySource).toBe("database");
  });

  it("falls back to the environment key when the stored one cannot be decrypted", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-from-env");
    const ciphertext = encryptLlmSecret("sk-from-database");
    // Standing in for a rotated BETTER_AUTH_SECRET.
    vi.stubEnv("BETTER_AUTH_SECRET", "b".repeat(32));
    configureLlmSettingsLoader(async () => record({ apiKeyCiphertext: ciphertext }));

    await refreshLlmSettings();

    expect(llmSettings().apiKey).toBe("sk-from-env");
  });

  it("keeps serving the last good snapshot when a load fails", async () => {
    configureLlmSettingsLoader(async () => record({ regulatoryModel: "gpt-5-nano" }));
    await refreshLlmSettings();

    configureLlmSettingsLoader(() => Promise.reject(new Error("database unavailable")));
    await refreshLlmSettings();

    expect(llmSettings().regulatoryModel).toBe("gpt-5-nano");
  });
});
