import { afterEach, describe, expect, it, vi } from "vitest";

import {
  embeddingProviderOptions,
  languageModel,
  languageProviderOptions,
  LlmNotConfiguredError,
  openAiPromptCacheKey,
} from "./llm-provider.js";
import { resetLlmSettingsSnapshot, setLlmSettingsSnapshot } from "./llm-settings-store.js";

afterEach(() => {
  resetLlmSettingsSnapshot();
  vi.unstubAllEnvs();
});

describe("multi-provider model resolution", () => {
  it.each([
    ["openai", "gpt-5-mini", "OPENAI_API_KEY"],
    ["anthropic", "claude-sonnet-4-6", "ANTHROPIC_API_KEY"],
    ["google", "gemini-3.6-flash", "GOOGLE_GENERATIVE_AI_API_KEY"],
  ] as const)("creates a %s language model from its own credential", (provider, model, key) => {
    vi.stubEnv(key, `${provider}-secret`);
    expect(languageModel({ provider, model })).toBeTruthy();
  });

  it("never falls back to another provider's credential", () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-secret");
    expect(() => languageModel({ provider: "anthropic", model: "claude-sonnet-4-6" })).toThrow(
      LlmNotConfiguredError,
    );
  });

  it("invalidates a provider client when its resolved key changes", () => {
    vi.stubEnv("OPENAI_API_KEY", "first-secret");
    const first = languageModel({ provider: "openai", model: "gpt-5-mini" });
    vi.stubEnv("OPENAI_API_KEY", "second-secret");
    resetLlmSettingsSnapshot();
    const second = languageModel({ provider: "openai", model: "gpt-5-mini" });
    expect(second).not.toBe(first);
  });

  it("uses provider-specific request and embedding options", () => {
    setLlmSettingsSnapshot({
      googleThinkingBudget: 2_048,
      googleThinkingLevel: "high",
      anthropicEffort: "high",
      anthropicSpeed: "standard",
    });
    expect(languageProviderOptions("anthropic")).toEqual({
      anthropic: { effort: "high", speed: "standard", structuredOutputMode: "auto" },
    });
    expect(languageProviderOptions("google", { model: "gemini-2.5-pro" })).toEqual({
      google: { thinkingConfig: { thinkingBudget: 2_048, includeThoughts: false } },
    });
    expect(languageProviderOptions("google", { model: "gemini-3.6-flash" })).toEqual({
      google: { thinkingConfig: { thinkingLevel: "high", includeThoughts: false } },
    });
    expect(embeddingProviderOptions("google", "document")).toEqual({
      google: { outputDimensionality: 768, taskType: "RETRIEVAL_DOCUMENT" },
    });
  });

  it("keeps OpenAI prompt cache keys within the 64-character limit", () => {
    expect(openAiPromptCacheKey("law-articles:run-1")).toBe("law-articles:run-1");
    const long = "law-articles:cmvsier3y004101qho46rw4gr:Décret exécutif n° 06-198 du 31 mai 2006";
    const other = `${long} modifié`;
    const key = openAiPromptCacheKey(long);
    expect(Buffer.byteLength(key, "utf8")).toBeLessThanOrEqual(64);
    expect(key.startsWith("law-articles:cmvsier3y004101qho46rw4gr:")).toBe(true);
    expect(openAiPromptCacheKey(long)).toBe(key);
    expect(openAiPromptCacheKey(other)).not.toBe(key);
  });
});
