import { getQueueToken } from "@nestjs/bullmq";
import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { regulatoryAnalysisErrorMessages } from "@qhse/contracts";
import { unindexedSearchableChunkFilter } from "@qhse/database";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentStorageService } from "./document-storage.service.js";
import { DocumentsService } from "./documents.service.js";

describe("DocumentsService dependency injection", () => {
  const previousDatabaseUrl = process.env["DATABASE_URL"];

  beforeAll(() => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
  });

  afterAll(() => {
    if (previousDatabaseUrl === undefined) {
      delete process.env["DATABASE_URL"];
      return;
    }

    process.env["DATABASE_URL"] = previousDatabaseUrl;
  });

  it("resolves its storage and processing queue dependencies", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: DocumentStorageService, useValue: {} },
        {
          provide: getQueueToken("document-processing"),
          useValue: { add: vi.fn() },
        },
      ],
    }).compile();

    expect(moduleRef.get(DocumentsService)).toBeInstanceOf(DocumentsService);
    await moduleRef.close();
  });
});

describe("DocumentsService upload retries", () => {
  function serviceWith(database: object, queue: object = { add: vi.fn() }) {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    const service = new DocumentsService({} as never, queue as never);
    (service as unknown as { database: object }).database = database;
    return service;
  }

  const user = { id: "user-1", platformRole: "content_manager" } as never;
  const input = {
    originalFileName: "standard.pdf",
    mimeType: "application/pdf",
    fileSize: 128,
    fileHash: "a".repeat(64),
    rights: {
      storage: true,
      extraction: true,
      embedding: true,
      aiProcessing: true,
      externalProviderProcessing: true,
      excerptDisplay: true,
      export: true,
    },
    allowDuplicate: false,
  } as const;

  it("resumes an unconfirmed revision with the same hash", async () => {
    const resumable = { id: "version-1", ...input, fileSize: BigInt(input.fileSize) };
    const database = {
      document: { findFirst: vi.fn().mockResolvedValue({ id: "document-1", status: "UPLOADED" }) },
      documentVersion: { findFirst: vi.fn().mockResolvedValue(resumable) },
    };
    const service = serviceWith(database);

    await expect(service.createVersion(user, "document-1", input)).resolves.toMatchObject({
      id: "version-1",
    });
    expect(database.documentVersion.findFirst).toHaveBeenCalledWith({
      where: {
        documentId: "document-1",
        fileHash: input.fileHash,
        status: "UPLOADED",
        files: { none: { fileRole: "primary" } },
      },
    });
  });

  it("returns active jobs when processing is already underway", async () => {
    const jobs = [{ id: "job-1", status: "PENDING" }];
    const queue = { add: vi.fn() };
    const database = {
      documentVersion: {
        findFirst: vi.fn().mockResolvedValue({ id: "version-1", status: "PROCESSING" }),
      },
      documentProcessingJob: { findMany: vi.fn().mockResolvedValue(jobs) },
    };
    const service = serviceWith(database, queue);

    await expect(
      service.startProcessing(user, "document-1", "version-1", { force: false }),
    ).resolves.toEqual({ versionId: "version-1", jobs, alreadyProcessing: true });
    expect(database.documentProcessingJob.findMany).toHaveBeenCalledWith({
      where: { documentVersionId: "version-1" },
      orderBy: { createdAt: "asc" },
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("detects duplicates only after a primary file is confirmed", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "version-2",
        versionLabel: "1",
        createdAt: new Date(),
        status: "UPLOADED",
        document: { id: "document-2", title: "Existing" },
      });
    const service = serviceWith({
      document: { findFirst: vi.fn().mockResolvedValue({ id: "document-1", status: "UPLOADED" }) },
      documentVersion: { findFirst },
    });

    await expect(service.createVersion(user, "document-1", input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(findFirst).toHaveBeenLastCalledWith({
      where: { fileHash: input.fileHash, files: { some: { fileRole: "primary" } } },
      include: { document: { select: { id: true, title: true } } },
    });
  });

  it("derives replacement revision controls from the published revision", async () => {
    const create = vi.fn().mockResolvedValue({ id: "version-2" });
    const database = {
      document: {
        findFirst: vi.fn().mockResolvedValue({
          id: "document-1",
          status: "PUBLISHED",
          currentVersionId: "version-1",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      documentVersion: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        aggregate: vi.fn().mockResolvedValue({ _max: { versionNumber: 1 } }),
        create,
      },
      documentActivity: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = serviceWith(database);

    await service.createVersion(user, "document-1", input);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        versionNumber: 2,
        versionLabel: "r2",
        changeType: "REPLACEMENT",
        supersedesVersionId: "version-1",
        embeddingAllowed: true,
        externalProviderAllowed: true,
      }),
    });
  });

  it("atomically switches publication and closes the prior effective interval", async () => {
    const now = new Date("2026-08-08T00:00:00.000Z");
    const updateVersion = vi.fn().mockResolvedValue({ id: "version-2", status: "PUBLISHED" });
    const transactionClient = {
      document: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ currentVersionId: "version-1" }),
        update: vi.fn().mockResolvedValue({}),
      },
      documentVersion: { update: updateVersion },
      regulatorySyncEvent: {
        upsert: vi.fn().mockResolvedValue({ id: "impact-1" }),
      },
    };
    const transaction = vi.fn(
      async (operation: (tx: typeof transactionClient) => Promise<unknown>) =>
        operation(transactionClient),
    );
    const database = {
      documentVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: "version-2",
          documentId: "document-1",
          status: "VALIDATED",
          effectiveDate: now,
        }),
      },
      documentActivity: { create: vi.fn().mockResolvedValue({}) },
      $transaction: transaction,
    };
    const service = serviceWith(database);

    await service.publishVersion(user, "document-1", "version-2", true);

    expect(updateVersion).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: "version-1" },
        data: { expirationDate: now },
      }),
    );
    expect(transactionClient.regulatorySyncEvent.upsert).toHaveBeenCalledWith({
      where: { publishedVersionId: "version-2" },
      create: expect.objectContaining({
        documentId: "document-1",
        previousVersionId: "version-1",
        publishedVersionId: "version-2",
      }),
      update: {},
    });
  });

  it("reports the exact incomplete validation checklist items and uses latest jobs", async () => {
    const database = {
      documentVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: "version-1",
          documentId: "document-1",
          status: "REVIEW_REQUIRED",
          files: [{ id: "file-1" }],
          sections: [{ id: "section-1" }],
          metadataSuggestions: [{ id: "suggestion-1" }],
          reviewIssues: [],
          processingJobs: [
            { jobType: "text_extraction", status: "COMPLETED" },
            { jobType: "security_scan", status: "COMPLETED" },
            { jobType: "file_validation", status: "COMPLETED" },
            { jobType: "ocr", status: "SKIPPED" },
          ],
          document: { taxonomyTerms: [] },
          ocrUsed: false,
          ocrConfidence: null,
        }),
      },
    };
    const service = serviceWith(database);

    const error = await service
      .validateVersion(
        { id: "admin-1", platformRole: "super_admin" } as never,
        "document-1",
        "version-1",
        true,
      )
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      message:
        "Publication checklist is incomplete: review detected metadata, approve at least one classification",
      details: {
        missing: [
          { key: "metadataValidated", label: "review detected metadata" },
          { key: "classificationApproved", label: "approve at least one classification" },
        ],
      },
    });
    expect(database.documentVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ processingJobs: { orderBy: { createdAt: "desc" } } }),
      }),
    );
  });
});

describe("DocumentsService embedding profile readiness", () => {
  const previousRagFlag = process.env["NORMATIVE_RAG_ENABLED"];
  const previousApiKey = process.env["OPENAI_API_KEY"];

  beforeEach(() => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
    process.env["NORMATIVE_RAG_ENABLED"] = "true";
    process.env["OPENAI_API_KEY"] = "sk-test";
  });

  afterEach(() => {
    if (previousRagFlag === undefined) delete process.env["NORMATIVE_RAG_ENABLED"];
    else process.env["NORMATIVE_RAG_ENABLED"] = previousRagFlag;
    if (previousApiKey === undefined) delete process.env["OPENAI_API_KEY"];
    else process.env["OPENAI_API_KEY"] = previousApiKey;
  });

  const user = { id: "user-1", platformRole: "platform_admin" } as never;

  function serviceWith(database: object) {
    const service = new DocumentsService({} as never, { add: vi.fn() } as never);
    (service as unknown as { database: object }).database = database;
    return service;
  }

  /** `missingByProfile` maps a profile id to its count of unindexed chunks. */
  function databaseWith(
    profiles: Array<Record<string, unknown>>,
    missingByProfile: Record<string, number> = {},
  ) {
    return {
      embeddingProfile: {
        findMany: vi.fn().mockResolvedValue(profiles),
        findUnique: vi.fn(
          async ({ where }: { where: { id: string } }) =>
            profiles.find((profile) => profile["id"] === where.id) ?? null,
        ),
        updateMany: vi.fn(),
        update: vi.fn(async ({ data }: { data: object }) => ({ ...profiles[0], ...data })),
      },
      documentChunk: {
        count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          const scoped = where["embeddings"] as
            { none: { embeddingProfileId: string } } | undefined;
          if (!scoped) return 42; // total searchable chunks
          return missingByProfile[scoped.none.embeddingProfileId] ?? 0;
        }),
      },
      $transaction: vi.fn(async (run: (tx: unknown) => unknown) => run(undefined)),
    };
  }

  const profile = (overrides: Record<string, unknown>) => ({
    id: "profile-1",
    key: "openai:text-embedding-3-small:768:v1",
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 768,
    version: 1,
    status: "BUILDING",
    activatedAt: null,
    retiredAt: null,
    ...overrides,
  });

  it("names the missing rollout step when no profile exists", async () => {
    const service = serviceWith(databaseWith([]));

    await expect(service.embeddingProfileReadiness(user)).resolves.toMatchObject({
      searchable: false,
      reason: "EMBEDDING_PROFILE_MISSING",
      profiles: [],
    });
  });

  it("reports a READY profile as awaiting activation, not as broken", async () => {
    const service = serviceWith(databaseWith([profile({ status: "READY" })]));

    const readiness = await service.embeddingProfileReadiness(user);

    expect(readiness).toMatchObject({
      searchable: false,
      reason: "EMBEDDING_PROFILE_NOT_ACTIVATED",
    });
    expect(readiness.profiles[0]).toMatchObject({ missingChunks: 0, activatable: true });
  });

  it("reports a still-building profile separately", async () => {
    const service = serviceWith(
      databaseWith([profile({ status: "BUILDING" })], { "profile-1": 9 }),
    );

    const readiness = await service.embeddingProfileReadiness(user);

    expect(readiness).toMatchObject({ searchable: false, reason: "EMBEDDING_PROFILE_BUILDING" });
    expect(readiness.profiles[0]).toMatchObject({
      missingChunks: 9,
      complete: false,
      activatable: false,
    });
  });

  it("declares search healthy when the active profile covers the corpus", async () => {
    const service = serviceWith(databaseWith([profile({ status: "ACTIVE" })]));

    await expect(service.embeddingProfileReadiness(user)).resolves.toMatchObject({
      searchable: true,
      reason: null,
      message: null,
      searchableChunks: 42,
    });
  });

  it("flags an active profile that newly published content has outrun", async () => {
    const service = serviceWith(databaseWith([profile({ status: "ACTIVE" })], { "profile-1": 3 }));

    await expect(service.embeddingProfileReadiness(user)).resolves.toMatchObject({
      searchable: false,
      reason: "EMBEDDING_PROFILE_STALE",
    });
  });

  it("blames the environment before the data when the flag is off", async () => {
    process.env["NORMATIVE_RAG_ENABLED"] = "false";
    const service = serviceWith(databaseWith([profile({ status: "ACTIVE" })]));

    await expect(service.embeddingProfileReadiness(user)).resolves.toMatchObject({
      searchable: false,
      reason: "NORMATIVE_RAG_DISABLED",
      ragEnabled: false,
    });
  });

  it("reports a missing OpenAI key", async () => {
    delete process.env["OPENAI_API_KEY"];
    const service = serviceWith(databaseWith([profile({ status: "ACTIVE" })]));

    await expect(service.embeddingProfileReadiness(user)).resolves.toMatchObject({
      reason: "OPENAI_KEY_MISSING",
      openAiConfigured: false,
    });
  });

  it("returns customer-facing French copy for the diagnosis", async () => {
    const service = serviceWith(databaseWith([]));

    const readiness = await service.embeddingProfileReadiness(user);

    expect(readiness.message).toBe(regulatoryAnalysisErrorMessages.EMBEDDING_PROFILE_MISSING);
  });

  it("refuses to read readiness without the view permission", async () => {
    const service = serviceWith(databaseWith([]));

    await expect(
      service.embeddingProfileReadiness({ id: "u", platformRole: "client_user" } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("DocumentsService embedding profile activation", () => {
  const user = { id: "user-1", platformRole: "platform_admin" } as never;

  beforeEach(() => {
    process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
  });

  function serviceWith(database: object) {
    const service = new DocumentsService({} as never, { add: vi.fn() } as never);
    (service as unknown as { database: object }).database = database;
    return service;
  }

  const ready = { id: "profile-2", status: "READY" };

  it("retires the previous profile atomically when activating", async () => {
    const updateMany = vi.fn();
    const update = vi.fn().mockResolvedValue({ ...ready, status: "ACTIVE" });
    const service = serviceWith({
      embeddingProfile: {
        findUnique: vi.fn().mockResolvedValue(ready),
        updateMany,
        update,
      },
      documentChunk: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn(async (run: (tx: unknown) => unknown) =>
        run({ embeddingProfile: { updateMany, update } }),
      ),
    });

    await expect(service.activateEmbeddingProfile(user, "profile-2")).resolves.toMatchObject({
      status: "ACTIVE",
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "ACTIVE", id: { not: "profile-2" } },
      }),
    );
  });

  it("refuses to activate a profile that does not cover every searchable chunk", async () => {
    const service = serviceWith({
      embeddingProfile: { findUnique: vi.fn().mockResolvedValue(ready) },
      documentChunk: { count: vi.fn().mockResolvedValue(5) },
    });

    await expect(service.activateEmbeddingProfile(user, "profile-2")).rejects.toThrow(
      "5 searchable chunks are not indexed",
    );
  });

  it("gates the coverage check on exactly the retriever's revision filter", async () => {
    // The activation gate and the worker's READY gate must agree, or a profile
    // can be READY yet permanently un-activatable.
    const count = vi.fn().mockResolvedValue(0);
    const service = serviceWith({
      embeddingProfile: {
        findUnique: vi.fn().mockResolvedValue(ready),
        updateMany: vi.fn(),
        update: vi.fn().mockResolvedValue(ready),
      },
      documentChunk: { count },
      $transaction: vi.fn(async (run: (tx: unknown) => unknown) =>
        run({ embeddingProfile: { updateMany: vi.fn(), update: vi.fn() } }),
      ),
    });

    await service.activateEmbeddingProfile(user, "profile-2");

    expect(count).toHaveBeenCalledWith({ where: unindexedSearchableChunkFilter("profile-2") });
  });

  it("refuses to activate a profile that is still building", async () => {
    const service = serviceWith({
      embeddingProfile: { findUnique: vi.fn().mockResolvedValue({ ...ready, status: "BUILDING" }) },
    });

    await expect(service.activateEmbeddingProfile(user, "profile-2")).rejects.toThrow(
      "Embedding profile is not ready",
    );
  });
});
