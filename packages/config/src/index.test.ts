import { describe, expect, it } from "vitest";

import { serverEnvironmentSchema } from "./index.js";

describe("serverEnvironmentSchema", () => {
  it("treats a blank optional OpenAI key as not configured", () => {
    expect(serverEnvironmentSchema.shape.OPENAI_API_KEY.parse("")).toBeUndefined();
    expect(serverEnvironmentSchema.shape.OPENAI_API_KEY.parse(undefined)).toBeUndefined();
    expect(serverEnvironmentSchema.shape.OPENAI_API_KEY.parse("test-key")).toBe("test-key");
  });

  it("defaults regulatory analysis to bounded GPT-5.6 Luna calls", () => {
    expect(serverEnvironmentSchema.shape.OPENAI_REGULATORY_MODEL.parse(undefined)).toBe(
      "gpt-5.6-luna",
    );
    expect(serverEnvironmentSchema.shape.OPENAI_REGULATORY_REASONING_EFFORT.parse(undefined)).toBe(
      "low",
    );
    expect(serverEnvironmentSchema.shape.OPENAI_REGULATORY_TIMEOUT_MS.parse(undefined)).toBe(
      180_000,
    );
    expect(
      serverEnvironmentSchema.shape.OPENAI_REGULATORY_DRAFT_MAX_OUTPUT_TOKENS.parse(undefined),
    ).toBe(12_000);
    expect(
      serverEnvironmentSchema.shape.OPENAI_REGULATORY_VERIFICATION_MAX_OUTPUT_TOKENS.parse(
        undefined,
      ),
    ).toBe(10_000);
    expect(serverEnvironmentSchema.shape.OPENAI_REGULATORY_RUN_BUDGET_USD.parse(undefined)).toBe(1);
  });
});
