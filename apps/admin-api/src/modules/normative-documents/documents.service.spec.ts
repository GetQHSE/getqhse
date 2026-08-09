import { getQueueToken } from "@nestjs/bullmq";
import { ConflictException, UnprocessableEntityException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
