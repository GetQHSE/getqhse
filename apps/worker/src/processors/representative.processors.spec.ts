import { searchableRevisionFilter } from "@qhse/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EmbeddingGenerationProcessor } from "./representative.processors.js";

describe("embedding profile readiness transitions", () => {
  const previousDatabaseUrl = process.env["DATABASE_URL"];
  const previousRagFlag = process.env["NORMATIVE_RAG_ENABLED"];

  beforeEach(() => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    process.env["NORMATIVE_RAG_ENABLED"] = "true";
  });

  afterEach(() => {
    if (previousDatabaseUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = previousDatabaseUrl;
    if (previousRagFlag === undefined) delete process.env["NORMATIVE_RAG_ENABLED"];
    else process.env["NORMATIVE_RAG_ENABLED"] = previousRagFlag;
  });

  /**
   * Drives the processor with no pending chunks to embed, so only the
   * readiness bookkeeping at the end of the run is exercised — no OpenAI call.
   */
  function runWith(profile: Record<string, unknown>, missingChunks: number) {
    const profileUpdate = vi.fn();
    const chunkCount = vi.fn().mockResolvedValue(missingChunks);
    const processor = new EmbeddingGenerationProcessor();
    const database = {
      embeddingProfile: { findUnique: vi.fn().mockResolvedValue(profile), update: profileUpdate },
      documentChunk: { findMany: vi.fn().mockResolvedValue([]), count: chunkCount },
    };
    (processor as unknown as { database: object }).database = database;
    const perform = (
      processor as unknown as { perform(envelope: unknown): Promise<void> }
    ).perform.bind(processor);
    return {
      run: () => perform({ payload: { profileId: profile["id"] } }),
      profileUpdate,
      chunkCount,
    };
  }

  const building = {
    id: "profile-1",
    key: "openai:text-embedding-3-small:768:v1",
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 768,
    status: "BUILDING",
  };

  it("promotes a fully indexed BUILDING profile to READY", async () => {
    const { run, profileUpdate } = runWith(building, 0);

    await run();

    expect(profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { status: "READY" },
    });
  });

  it("leaves an incomplete BUILDING profile alone", async () => {
    const { run, profileUpdate } = runWith(building, 4);

    await run();

    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it("demotes a READY profile once new published content is unindexed", async () => {
    // Regression: a profile that reached READY before a document was published
    // used to stay READY forever while activation kept rejecting it, with no
    // path back to BUILDING short of creating a whole new profile.
    const { run, profileUpdate } = runWith({ ...building, status: "READY" }, 12);

    await run();

    expect(profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { status: "BUILDING" },
    });
  });

  it("does not disturb a READY profile that is still complete", async () => {
    const { run, profileUpdate } = runWith({ ...building, status: "READY" }, 0);

    await run();

    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it("never demotes the ACTIVE profile serving live search", async () => {
    // Retiring the live index mid-flight would break customer search; the
    // staleness is surfaced through the analysis error code instead.
    const { run, profileUpdate } = runWith({ ...building, status: "ACTIVE" }, 7);

    await run();

    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it("judges readiness against exactly the revisions the retriever can return", async () => {
    // Drift here is what let a profile be READY yet fail activation.
    const { run, chunkCount } = runWith(building, 0);

    await run();

    expect(chunkCount).toHaveBeenCalledWith({
      where: {
        version: searchableRevisionFilter,
        embeddings: { none: { embeddingProfileId: "profile-1" } },
      },
    });
  });

  it("refuses to run when normative RAG is disabled", async () => {
    process.env["NORMATIVE_RAG_ENABLED"] = "false";
    const { run } = runWith(building, 0);

    await expect(run()).rejects.toThrow("Normative RAG is disabled");
  });

  it("rejects a profile whose vector shape does not match the schema", async () => {
    const { run } = runWith({ ...building, dimensions: 1536 }, 0);

    await expect(run()).rejects.toThrow("768 dimensions");
  });
});
