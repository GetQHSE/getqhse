import type { Prisma } from "@qhse/database";
import { roItemSchema, roProgressSchema, roEffectivenessSchema } from "@qhse/contracts";
export const roItemInclude = {
  actions: {
    include: { events: { orderBy: { createdAt: "desc" as const } } },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.RoItemInclude;
export function mapRoItem(row: Prisma.RoItemGetPayload<{ include: typeof roItemInclude }>) {
  return roItemSchema.parse({
    id: row.id,
    origin: row.origin,
    source: row.sourceSnapshot,
    aiProposal: row.aiProposal,
    effective: row.effective,
    reviewStatus: row.reviewStatus,
    actions: row.actions.map((a) => ({
      id: a.id,
      origin: a.origin,
      content: a.effective,
      aiProposal: a.aiProposal,
      reviewStatus: a.reviewStatus,
      progress: a.events.find((e) => e.kind === "progress")
        ? roProgressSchema.parse(a.events.find((e) => e.kind === "progress")!.content)
        : null,
      effectiveness: a.events
        .filter((e) => e.kind === "effectiveness")
        .map((e) => roEffectivenessSchema.parse(e.content)),
    })),
  });
}
