import { describe, expect, it } from "vitest";
import {
  createPromptRevisionSchema,
  publishPromptRevisionSchema,
  testPromptRevisionSchema,
} from "./ai-prompts.js";

describe("AI prompt contracts", () => {
  it("bounds editable input and rejects unexpected fields", () => {
    expect(
      createPromptRevisionSchema.safeParse({ template: "x".repeat(30001), changeNote: "test" })
        .success,
    ).toBe(false);
    expect(
      testPromptRevisionSchema.safeParse({
        context: "Synthetic company",
        language: "fr",
        countries: "MA",
        apiKey: "secret",
      }).success,
    ).toBe(false);
    expect(
      testPromptRevisionSchema.parse({ context: "Synthetic company", language: "ar" }).countries,
    ).toBe("MA");
  });
  it("requires optimistic locking and a valid reset/revision pairing", () => {
    const input = {
      revisionId: "rev-1",
      action: "PUBLISH",
      note: "PO approved",
      expectedGeneration: 0,
    };
    expect(publishPromptRevisionSchema.safeParse(input).success).toBe(true);
    expect(publishPromptRevisionSchema.safeParse({ ...input, revisionId: null }).success).toBe(
      false,
    );
    expect(publishPromptRevisionSchema.safeParse({ ...input, action: "RESET" }).success).toBe(
      false,
    );
    expect(
      publishPromptRevisionSchema.safeParse({ ...input, action: "RESET", revisionId: null })
        .success,
    ).toBe(true);
    expect(
      publishPromptRevisionSchema.safeParse({ ...input, expectedGeneration: -1 }).success,
    ).toBe(false);
  });
});
