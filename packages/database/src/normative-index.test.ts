import { describe, expect, it } from "vitest";

import {
  embeddableRevisionFilter,
  embeddingRightsFilter,
  indexableProfileStatuses,
  searchableRevisionFilter,
  unindexedSearchableChunkFilter,
} from "./normative-index.js";

describe("normative index eligibility filters", () => {
  it("requires every external-processing right before text may be embedded", () => {
    // A revision reaching OpenAI without one of these is a licensing breach.
    expect(embeddingRightsFilter).toEqual({
      storageAllowed: true,
      extractionAllowed: true,
      embeddingAllowed: true,
      aiProcessingAllowed: true,
      externalProviderAllowed: true,
      excerptDisplayAllowed: true,
    });
  });

  it("lets validated revisions be pre-indexed before publication", () => {
    expect(embeddableRevisionFilter.status).toEqual({ in: ["VALIDATED", "PUBLISHED"] });
    expect(embeddableRevisionFilter.validatedAt).toEqual({ not: null });
  });

  it("only counts published, visible revisions as searchable", () => {
    expect(searchableRevisionFilter.status).toBe("PUBLISHED");
    expect(searchableRevisionFilter.validatedAt).toEqual({ not: null });
    expect(searchableRevisionFilter.document).toEqual({
      status: { not: "ARCHIVED" },
      deletedAt: null,
      visibility: { in: ["ORGANIZATION_AVAILABLE", "PUBLIC_REFERENCE"] },
    });
  });

  it("keeps the searchable set a subset of the embeddable set", () => {
    // If a revision could be searchable without being embeddable, readiness
    // would never be reachable: the worker would refuse to index it.
    for (const [right, value] of Object.entries(embeddingRightsFilter)) {
      expect(searchableRevisionFilter[right as keyof typeof embeddingRightsFilter]).toBe(value);
      expect(embeddableRevisionFilter[right as keyof typeof embeddingRightsFilter]).toBe(value);
    }
    expect(embeddableRevisionFilter.status).toMatchObject({
      in: expect.arrayContaining([searchableRevisionFilter.status]),
    });
  });

  it("scopes the unindexed-chunk query to one profile", () => {
    expect(unindexedSearchableChunkFilter("profile-1")).toEqual({
      version: searchableRevisionFilter,
      embeddings: { none: { embeddingProfileId: "profile-1" } },
    });
  });

  it("treats BUILDING, READY and ACTIVE as writable by an indexing job", () => {
    // READY must be included so newly published content re-enters an existing
    // profile instead of stranding it.
    expect([...indexableProfileStatuses]).toEqual(["BUILDING", "READY", "ACTIVE"]);
  });
});
