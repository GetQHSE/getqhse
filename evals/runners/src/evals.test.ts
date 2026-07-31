import { describe, expect, it } from "vitest";

import {
  ComplianceAnalysisProvider,
  DeterministicAnalysisProvider,
  runValidatedAnalysis,
} from "./index.js";

const input = {
  requirementId: "req-1",
  requirementText: "The organization shall perform documented inspections.",
  evidence: [{ id: "evidence-1", text: "Monthly safety inspection completed." }],
  allowedClauseIds: ["clause-9.1"],
};

describe("AI quality foundation", () => {
  it("matches relevant evidence deterministically", async () => {
    const result = await runValidatedAnalysis(new DeterministicAnalysisProvider(), input);
    expect(result.score).toBe(100);
    expect(result.citations).toEqual(["evidence-1"]);
  });

  it("allows citations to supplied clauses", async () => {
    class ClauseProvider extends ComplianceAnalysisProvider {
      async analyze() {
        return {
          score: 50,
          applicableCount: 1,
          conformingCount: 0,
          explanation: "Partial support.",
          citations: ["clause-9.1"],
          humanReviewRequired: true,
        };
      }
    }
    await expect(runValidatedAnalysis(new ClauseProvider(), input)).resolves.toBeDefined();
  });

  it("rejects hallucinated citations", async () => {
    class HallucinatingProvider extends ComplianceAnalysisProvider {
      async analyze() {
        return {
          score: 100,
          applicableCount: 1,
          conformingCount: 1,
          explanation: "Unsupported claim.",
          citations: ["imaginary-document"],
          humanReviewRequired: false,
        };
      }
    }
    await expect(runValidatedAnalysis(new HallucinatingProvider(), input)).rejects.toThrow(
      "unsupported citation",
    );
  });

  it("rejects malformed compliance output", async () => {
    class InvalidProvider extends ComplianceAnalysisProvider {
      async analyze() {
        return { score: 150, citations: "none" };
      }
    }
    await expect(runValidatedAnalysis(new InvalidProvider(), input)).rejects.toThrow();
  });
});
