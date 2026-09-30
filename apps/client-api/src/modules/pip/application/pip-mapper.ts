import {
  pipPartySchema,
  pipPartyContentSchema,
  pipRequirementContentSchema,
  pipEvaluationContentSchema,
} from "@qhse/contracts";
import type { Prisma } from "@qhse/database";

export const pipPartyInclude = {
  requirements: { orderBy: { createdAt: "asc" } },
  evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
} satisfies Prisma.PipPartyInclude;
type PartyRow = Prisma.PipPartyGetPayload<{ include: typeof pipPartyInclude }>;
export function mapPipParty(row: PartyRow) {
  const evaluation = row.evaluations[0];
  return pipPartySchema.parse({
    id: row.id,
    origin: row.origin,
    content: pipPartyContentSchema.parse(row.effective),
    aiProposal: row.aiProposal ? pipPartyContentSchema.parse(row.aiProposal) : null,
    reviewStatus: row.reviewStatus,
    requirements: row.requirements.map((r) => ({
      id: r.id,
      origin: r.origin,
      content: pipRequirementContentSchema.parse(r.effective),
      aiProposal: r.aiProposal ? pipRequirementContentSchema.parse(r.aiProposal) : null,
      reviewStatus: r.reviewStatus,
      services: r.services,
      allocationReviewed: r.allocationReviewed,
      noServiceConfirmed: r.noServiceConfirmed,
    })),
    evaluation: evaluation
      ? {
          id: evaluation.id,
          content: pipEvaluationContentSchema.parse(evaluation.effective),
          aiProposal: evaluation.aiProposal
            ? pipEvaluationContentSchema.parse(evaluation.aiProposal)
            : null,
          reviewStatus: evaluation.reviewStatus,
          methodologyVersion: evaluation.methodologyVersion,
          strategyVersion: evaluation.strategyVersion,
        }
      : null,
  });
}
