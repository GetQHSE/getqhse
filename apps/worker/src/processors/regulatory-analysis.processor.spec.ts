import { RegulatoryAnalysisError } from "@qhse/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildRegulatoryQueries,
  computeProfileChanges,
  matchProvisionRevision,
  RegulatoryAnalysisProcessor,
} from "./regulatory-analysis.processor.js";

describe("regulatory analysis query planning", () => {
  it("builds bounded searches from the regulatory profile snapshot", () => {
    const queries = buildRegulatoryQueries({
      fields: {
        "organization.primarySector": "Métallurgie",
        "organization.offerings": ["Armoires métalliques", "Soudage"],
        "operations.keyProcesses": ["Découpe", "Peinture"],
        "scope.operatingCountries": ["MA"],
        "regulatory.knownRequirements": ["ISO 9001"],
      },
    });
    expect(queries).toHaveLength(6);
    expect(queries[0]).toContain("Métallurgie");
    expect(queries.some((query) => query.includes("ISO 9001"))).toBe(true);
    expect(queries.every((query) => query.length < 20_000)).toBe(true);
  });

  it("computes only material profile changes", () => {
    expect(
      computeProfileChanges(
        { fields: { sector: "Métallurgie", countries: ["MA"] } },
        { fields: { sector: "Métallurgie", countries: ["MA", "FR"] } },
      ),
    ).toEqual([{ key: "countries", previous: ["MA"], current: ["MA", "FR"] }]);
  });

  it("matches unchanged and modified provisions across revisions by logical identity", () => {
    const previous = {
      documentId: "document-1",
      language: "fr",
      identifier: "Article 12",
      headingPath: ["Titre II"],
      contentHash: "hash-1",
    };
    expect(matchProvisionRevision(previous, [{ ...previous }]).changeType).toBe("UNCHANGED");
    expect(
      matchProvisionRevision(previous, [{ ...previous, contentHash: "hash-2" }]).changeType,
    ).toBe("MODIFIED");
  });

  it("never guesses when a provision is missing or ambiguous", () => {
    const previous = {
      documentId: "document-1",
      language: "ar",
      identifier: null,
      headingPath: ["المادة 12"],
      contentHash: "hash-1",
    };
    expect(matchProvisionRevision(previous, [])).toEqual({
      match: null,
      changeType: "REMOVAL_PROPOSED",
      ambiguous: false,
    });
    expect(matchProvisionRevision(previous, [{ ...previous }, { ...previous }])).toMatchObject({
      match: null,
      changeType: "REMOVAL_PROPOSED",
      ambiguous: true,
    });
  });
});

describe("regulatory analysis embedding profile diagnosis", () => {
  const previousDatabaseUrl = process.env["DATABASE_URL"];
  const previousRagFlag = process.env["NORMATIVE_RAG_ENABLED"];
  const previousApiKey = process.env["OPENAI_API_KEY"];

  beforeEach(() => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    process.env["NORMATIVE_RAG_ENABLED"] = "true";
    process.env["OPENAI_API_KEY"] = "sk-test";
  });

  afterEach(() => {
    restore("DATABASE_URL", previousDatabaseUrl);
    restore("NORMATIVE_RAG_ENABLED", previousRagFlag);
    restore("OPENAI_API_KEY", previousApiKey);
  });

  function restore(key: string, value: string | undefined) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  /**
   * Builds a processor whose Prisma client is replaced, then exposes the
   * private resolver the analysis phase depends on.
   */
  function resolverWith(database: object) {
    const processor = new RegulatoryAnalysisProcessor();
    (processor as unknown as { database: object }).database = database;
    return () =>
      (
        processor as unknown as { resolveActiveEmbeddingProfile(): Promise<{ id: string }> }
      ).resolveActiveEmbeddingProfile();
  }

  function databaseWith(profiles: Array<Record<string, unknown>>, unindexedChunk: object | null) {
    return {
      embeddingProfile: {
        findFirst: vi.fn(async ({ where }: { where: { status: unknown } }) => {
          const wanted =
            typeof where.status === "string"
              ? [where.status]
              : ((where.status as { in: string[] }).in ?? []);
          const matches = profiles.filter((profile) =>
            wanted.includes(profile["status"] as string),
          );
          return (
            [...matches].sort((a, b) => Number(b["version"] ?? 0) - Number(a["version"] ?? 0))[0] ??
            null
          );
        }),
      },
      documentChunk: { findFirst: vi.fn().mockResolvedValue(unindexedChunk) },
    };
  }

  it("returns the active profile when it covers every searchable revision", async () => {
    const active = { id: "profile-3", key: "openai:v3", status: "ACTIVE", version: 3 };
    await expect(resolverWith(databaseWith([active], null))()).resolves.toMatchObject({
      id: "profile-3",
    });
  });

  it("reports a missing profile when the corpus was never indexed", async () => {
    await expect(resolverWith(databaseWith([], null))()).rejects.toThrowError(
      expect.objectContaining({ code: "EMBEDDING_PROFILE_MISSING" }),
    );
  });

  it("distinguishes an in-progress build from a profile awaiting activation", async () => {
    const building = { id: "profile-1", key: "openai:v1", status: "BUILDING", version: 1 };
    await expect(resolverWith(databaseWith([building], null))()).rejects.toThrowError(
      expect.objectContaining({ code: "EMBEDDING_PROFILE_BUILDING" }),
    );

    const ready = { id: "profile-2", key: "openai:v2", status: "READY", version: 2 };
    await expect(resolverWith(databaseWith([ready], null))()).rejects.toThrowError(
      expect.objectContaining({ code: "EMBEDDING_PROFILE_NOT_ACTIVATED" }),
    );
  });

  it("reports a stale profile when newly published content is unindexed", async () => {
    // The profile is ACTIVE, so search "works" — but the retriever silently
    // drops every revision with an unindexed chunk, which reads as an empty
    // corpus rather than a rollout gap unless we name it.
    const active = { id: "profile-3", key: "openai:v3", status: "ACTIVE", version: 3 };
    await expect(resolverWith(databaseWith([active], { id: "chunk-9" }))()).rejects.toThrowError(
      expect.objectContaining({ code: "EMBEDDING_PROFILE_STALE" }),
    );
  });

  it("prefers the newest pending profile when several exist", async () => {
    const profiles = [
      { id: "profile-1", key: "openai:v1", status: "READY", version: 1 },
      { id: "profile-2", key: "openai:v2", status: "BUILDING", version: 2 },
    ];
    await expect(resolverWith(databaseWith(profiles, null))()).rejects.toThrowError(
      expect.objectContaining({ code: "EMBEDDING_PROFILE_BUILDING" }),
    );
  });
});

describe("regulatory analysis failure recording", () => {
  const previousDatabaseUrl = process.env["DATABASE_URL"];

  beforeEach(() => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
  });

  afterEach(() => {
    if (previousDatabaseUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = previousDatabaseUrl;
  });

  function processorFailingWith(error: Error) {
    const runUpdate = vi.fn();
    const processor = new RegulatoryAnalysisProcessor();
    const database = {
      regulatoryAnalysisRun: {
        findUnique: vi.fn().mockResolvedValue({ id: "run-1", status: "RUNNING", watchId: "w-1" }),
        update: runUpdate,
      },
      projectRegulatoryWatch: { update: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    (processor as unknown as { database: object }).database = database;
    (processor as unknown as { analyze(): Promise<void> }).analyze = () => Promise.reject(error);
    return { processor, runUpdate };
  }

  const job = { data: { payload: { runId: "run-1" } } } as never;

  it("persists the specific reason rather than a blanket failure", async () => {
    const { processor, runUpdate } = processorFailingWith(
      new RegulatoryAnalysisError("EMBEDDING_PROFILE_NOT_ACTIVATED", "profile v2 is READY"),
    );

    await expect(processor.process(job)).rejects.toThrow("profile v2 is READY");
    expect(runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorCode: "EMBEDDING_PROFILE_NOT_ACTIVATED",
          errorMessage: "profile v2 is READY",
        }),
      }),
    );
  });

  it("falls back to ANALYSIS_FAILED for an uncoded error", async () => {
    const { processor, runUpdate } = processorFailingWith(new Error("boom"));

    await expect(processor.process(job)).rejects.toThrow("boom");
    expect(runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errorCode: "ANALYSIS_FAILED" }) }),
    );
  });
});
