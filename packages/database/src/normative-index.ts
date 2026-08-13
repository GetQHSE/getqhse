import type { Prisma } from "./generated/client/client.js";

/**
 * Rights flags a revision must carry before any of its text may reach an
 * external embedding provider. Shared so the worker, the admin readiness gate,
 * and the retriever cannot drift apart.
 */
export const embeddingRightsFilter = {
  storageAllowed: true,
  extractionAllowed: true,
  embeddingAllowed: true,
  aiProcessingAllowed: true,
  externalProviderAllowed: true,
  excerptDisplayAllowed: true,
} as const satisfies Prisma.DocumentVersionWhereInput;

/**
 * Revisions the worker is allowed to embed. Deliberately broader than
 * {@link searchableRevisionFilter}: a revision may be pre-indexed while it is
 * still VALIDATED so that publishing does not require a fresh embedding run.
 */
export const embeddableRevisionFilter = {
  status: { in: ["VALIDATED", "PUBLISHED"] },
  validatedAt: { not: null },
  ...embeddingRightsFilter,
} as const satisfies Prisma.DocumentVersionWhereInput;

/**
 * Revisions the customer-facing retriever may return. A profile is only
 * complete once every chunk of every revision matching this filter is indexed
 * under it, because the retriever drops a revision that has any unindexed chunk.
 */
export const searchableRevisionFilter = {
  status: "PUBLISHED",
  validatedAt: { not: null },
  ...embeddingRightsFilter,
  document: {
    status: { not: "ARCHIVED" },
    deletedAt: null,
    visibility: { in: ["ORGANIZATION_AVAILABLE", "PUBLIC_REFERENCE"] },
  },
} as const satisfies Prisma.DocumentVersionWhereInput;

/** Chunks that must be indexed under `profileId` before it can serve search. */
export function unindexedSearchableChunkFilter(profileId: string): Prisma.DocumentChunkWhereInput {
  return {
    version: searchableRevisionFilter,
    embeddings: { none: { embeddingProfileId: profileId } },
  };
}

/** Profile states that an indexing job may write embeddings into. */
export const indexableProfileStatuses = ["BUILDING", "READY", "ACTIVE"] as const;
