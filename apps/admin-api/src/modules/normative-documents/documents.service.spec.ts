import { getQueueToken } from "@nestjs/bullmq";
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
