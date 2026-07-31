import { complianceResultSchema, type ComplianceResult } from "@qhse/contracts";

export type AnalysisInput = {
  requirementId: string;
  requirementText: string;
  evidence: Array<{ id: string; text: string }>;
  allowedClauseIds: string[];
};

export abstract class ComplianceAnalysisProvider {
  abstract analyze(input: AnalysisInput): Promise<unknown>;
}

export class DeterministicAnalysisProvider extends ComplianceAnalysisProvider {
  async analyze(input: AnalysisInput): Promise<ComplianceResult> {
    const matching = input.evidence.filter((item) =>
      item.text.toLocaleLowerCase().includes("inspection"),
    );
    return {
      score: matching.length > 0 ? 100 : 0,
      applicableCount: 1,
      conformingCount: matching.length > 0 ? 1 : 0,
      explanation:
        matching.length > 0
          ? "The supplied evidence documents an inspection."
          : "No matching inspection evidence was supplied.",
      citations: matching.map((item) => item.id),
      humanReviewRequired: true,
    };
  }
}

export async function runValidatedAnalysis(
  provider: ComplianceAnalysisProvider,
  input: AnalysisInput,
): Promise<ComplianceResult> {
  const result = complianceResultSchema.parse(await provider.analyze(input));
  const permittedCitations = new Set([
    ...input.allowedClauseIds,
    ...input.evidence.map((item) => item.id),
  ]);
  if (result.citations.some((citation) => !permittedCitations.has(citation))) {
    throw new Error("Analysis contains an unsupported citation");
  }
  return result;
}
