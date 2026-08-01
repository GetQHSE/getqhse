import { getQueueToken } from "@nestjs/bullmq";
import { ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { DocumentStorageService } from "./document-storage.service.js";
import { DocumentsService } from "./documents.service.js";

describe("DocumentsService dependency injection", () => {
  const previousDatabaseUrl = process.env["DATABASE_URL"];

  beforeAll(() => {
    process.env["DATABASE_URL"] ??=
      "postgresql://postgres:postgres@localhost:5432/qhse_test";
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
  function serviceWith(database: object) {
    process.env["DATABASE_URL"] ??=
      "postgresql://postgres:postgres@localhost:5432/qhse_test";
    const service = new DocumentsService({} as never, { add: vi.fn() } as never);
    (service as unknown as { database: object }).database = database;
    return service;
  }

  const user = { id: "user-1", platformRole: "content_manager" } as never;
  const input = {
    versionLabel: "1",
    changeType: "initial",
    originalFileName: "standard.pdf",
    mimeType: "application/pdf",
    fileSize: 128,
    fileHash: "a".repeat(64),
    allowDuplicate: false,
  } as const;

  it("resumes an unconfirmed version with the same label and hash", async () => {
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
        versionLabel: "1",
        fileHash: input.fileHash,
        status: "UPLOADED",
        files: { none: { fileRole: "primary" } },
      },
    });
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
});
