import { describe, expect, it } from "vitest";

import {
  llmSettingsDefaults,
  llmSettingsFromEnvironment,
  llmSettingsOverrideSchema,
  resolveLlmSettings,
} from "./llm-settings.js";

describe("llmSettingsFromEnvironment", () => {
  it("falls back to the built-in defaults when nothing is set", () => {
    expect(llmSettingsFromEnvironment({})).toEqual(llmSettingsDefaults);
  });

  it("reads strings, numbers and booleans out of their environment variables", () => {
    const settings = llmSettingsFromEnvironment({
      OPENAI_REGULATORY_MODEL: "gpt-5",
      OPENAI_REGULATORY_TIMEOUT_MS: "90000",
      OPENAI_REGULATORY_RUN_BUDGET_USD: "2.5",
      NORMATIVE_RAG_ENABLED: "true",
      REGULATORY_TRIAGE_INCLUDE_UNSURE: "false",
    });

    expect(settings.regulatoryModel).toBe("gpt-5");
    expect(settings.regulatoryTimeoutMs).toBe(90_000);
    expect(settings.regulatoryRunBudgetUsd).toBe(2.5);
    expect(settings.ragEnabled).toBe(true);
    expect(settings.triageIncludeUnsure).toBe(false);
  });

  it("ignores a variable that fails its own validation instead of failing the whole read", () => {
    const settings = llmSettingsFromEnvironment({
      OPENAI_REGULATORY_TIMEOUT_MS: "not-a-number",
      OPENAI_REGULATORY_SERVICE_TIER: "turbo",
      OPENAI_REGULATORY_MODEL: "gpt-5",
    });

    expect(settings.regulatoryTimeoutMs).toBe(llmSettingsDefaults.regulatoryTimeoutMs);
    expect(settings.regulatoryServiceTier).toBe(llmSettingsDefaults.regulatoryServiceTier);
    expect(settings.regulatoryModel).toBe("gpt-5");
  });

  it("still honours the legacy micro-USD evaluation budget variable", () => {
    expect(llmSettingsFromEnvironment({}).regulatoryEvaluationBudgetUsd).toBe(10);
    expect(
      llmSettingsFromEnvironment({ REGULATORY_EVALUATION_BUDGET_MICRO_USD: "2500000" })
        .regulatoryEvaluationBudgetUsd,
    ).toBe(2.5);
  });

  it("lets the USD evaluation budget variable win over the legacy one", () => {
    expect(
      llmSettingsFromEnvironment({
        REGULATORY_EVALUATION_BUDGET_MICRO_USD: "2500000",
        REGULATORY_EVALUATION_BUDGET_USD: "40",
      }).regulatoryEvaluationBudgetUsd,
    ).toBe(40);
  });

  it("leaves the per-token rates unset so the model's published rate keeps applying", () => {
    expect(llmSettingsFromEnvironment({}).regulatoryInputUsdPerMTok).toBeNull();
    expect(
      llmSettingsFromEnvironment({ OPENAI_REGULATORY_INPUT_USD_PER_MTOK: "1.25" })
        .regulatoryInputUsdPerMTok,
    ).toBe(1.25);
  });
});

describe("resolveLlmSettings", () => {
  it("layers stored overrides on top of the environment", () => {
    const settings = resolveLlmSettings(
      { regulatoryModel: "gpt-5", ragEnabled: true },
      { OPENAI_REGULATORY_MODEL: "gpt-5-mini", OPENAI_REGULATORY_TIMEOUT_MS: "90000" },
    );

    expect(settings.regulatoryModel).toBe("gpt-5");
    expect(settings.ragEnabled).toBe(true);
    expect(settings.regulatoryTimeoutMs).toBe(90_000);
  });

  it("treats a null override as handing the field back to the environment", () => {
    const settings = resolveLlmSettings(
      { regulatoryModel: null },
      { OPENAI_REGULATORY_MODEL: "gpt-5" },
    );

    expect(settings.regulatoryModel).toBe("gpt-5");
  });
});

describe("llmSettingsOverrideSchema", () => {
  it("accepts a partial payload and rejects an unknown field", () => {
    expect(llmSettingsOverrideSchema.parse({ regulatoryModel: "gpt-5" })).toEqual({
      regulatoryModel: "gpt-5",
    });
    expect(llmSettingsOverrideSchema.safeParse({ nope: 1 }).success).toBe(false);
  });

  it("rejects values the pipeline cannot act on", () => {
    expect(llmSettingsOverrideSchema.safeParse({ regulatoryTimeoutMs: -1 }).success).toBe(false);
    expect(llmSettingsOverrideSchema.safeParse({ regulatoryServiceTier: "turbo" }).success).toBe(
      false,
    );
    expect(llmSettingsOverrideSchema.safeParse({ regulatoryModel: "" }).success).toBe(false);
  });
});
