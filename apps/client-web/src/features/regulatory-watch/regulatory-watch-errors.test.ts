import { regulatoryAnalysisErrorMessages } from "@qhse/contracts";
import { describe, expect, it } from "vitest";

import { analysisErrorMessage, analysisIsRetryable } from "./regulatory-watch-page.js";

describe("regulatory analysis failure copy", () => {
  it("never shows the customer a raw worker error string", () => {
    // The production incident surfaced the literal English message
    // "No active embedding profile" under a French heading.
    const message = analysisErrorMessage("EMBEDDING_PROFILE_MISSING");

    expect(message).toBe(regulatoryAnalysisErrorMessages.EMBEDDING_PROFILE_MISSING);
    expect(message).not.toMatch(/embedding profile/i);
  });

  it("falls back to the generic message for an unknown or absent code", () => {
    for (const code of [null, undefined, "", "SOMETHING_NEW"]) {
      expect(analysisErrorMessage(code)).toBe(regulatoryAnalysisErrorMessages.ANALYSIS_FAILED);
    }
  });

  it("covers every code the worker can persist", () => {
    for (const [code, expected] of Object.entries(regulatoryAnalysisErrorMessages)) {
      expect(analysisErrorMessage(code)).toBe(expected);
    }
  });

  it("hides retry only for failures that need a server config change", () => {
    // Retrying cannot flip an env var, so offering the button is a dead end.
    expect(analysisIsRetryable("NORMATIVE_RAG_DISABLED")).toBe(false);
    expect(analysisIsRetryable("OPENAI_KEY_MISSING")).toBe(false);
  });

  it("keeps retry available once an admin can fix the cause from Settings", () => {
    // Building, activating, or reindexing an embedding profile is now a
    // self-serve admin action, so retrying after that fix should work.
    expect(analysisIsRetryable("EMBEDDING_PROFILE_MISSING")).toBe(true);
    expect(analysisIsRetryable("EMBEDDING_PROFILE_NOT_ACTIVATED")).toBe(true);
    expect(analysisIsRetryable("EMBEDDING_PROFILE_STALE")).toBe(true);
    expect(analysisIsRetryable("EMBEDDING_PROFILE_BUILDING")).toBe(true);
    expect(analysisIsRetryable("QUEUE_ERROR")).toBe(true);
    expect(analysisIsRetryable("ANALYSIS_FAILED")).toBe(true);
    expect(analysisIsRetryable("CORPUS_COVERAGE_GAP")).toBe(true);
    expect(analysisIsRetryable(null)).toBe(true);
  });
});
