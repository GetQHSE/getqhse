import "reflect-metadata";

import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DocumentsController } from "./documents.controller.js";
import { DocumentsService } from "./documents.service.js";

describe("DocumentsController API", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it("resolves DocumentsService and serves GET /v1/documents", async () => {
    const response = { items: [], nextCursor: null };
    const documents = { list: vi.fn().mockResolvedValue(response) };
    const testingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [{ provide: DocumentsService, useValue: documents }],
    }).compile();
    app = testingModule.createNestApplication();
    await app.listen(0, "127.0.0.1");

    const result = await fetch(`${await app.getUrl()}/v1/documents`);

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual(response);
    expect(documents.list).toHaveBeenCalledOnce();
  });
});

describe("DocumentsController embedding profile routes", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  async function serve(documents: Record<string, unknown>) {
    const testingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [{ provide: DocumentsService, useValue: documents }],
    }).compile();
    app = testingModule.createNestApplication();
    await app.listen(0, "127.0.0.1");
    return app.getUrl();
  }

  it("serves the readiness diagnosis instead of matching it as a document id", async () => {
    // `@Get(":documentId")` is declared in the same controller and would
    // happily treat "embedding-profiles" as an id if ordering regressed.
    const readiness = {
      searchable: false,
      reason: "EMBEDDING_PROFILE_NOT_ACTIVATED",
      message: "L’index normatif est prêt mais n’a pas encore été activé.",
      ragEnabled: true,
      providerConfigured: true,
      searchableChunks: 120,
      profiles: [{ id: "profile-1", status: "READY", missingChunks: 0, activatable: true }],
    };
    const documents = {
      embeddingProfileReadiness: vi.fn().mockResolvedValue(readiness),
      get: vi.fn(),
    };
    const url = await serve(documents);

    const result = await fetch(`${url}/v1/documents/embedding-profiles`);

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual(readiness);
    expect(documents.embeddingProfileReadiness).toHaveBeenCalledOnce();
    expect(documents.get).not.toHaveBeenCalled();
  });

  it("still routes a real document id to the document handler", async () => {
    const documents = {
      embeddingProfileReadiness: vi.fn(),
      get: vi.fn().mockResolvedValue({ id: "document-1" }),
    };
    const url = await serve(documents);

    const result = await fetch(`${url}/v1/documents/document-1`);

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({ id: "document-1" });
    expect(documents.embeddingProfileReadiness).not.toHaveBeenCalled();
  });

  it("activates a profile through the dedicated route", async () => {
    const documents = {
      activateEmbeddingProfile: vi.fn().mockResolvedValue({ id: "profile-1", status: "ACTIVE" }),
    };
    const url = await serve(documents);

    const result = await fetch(`${url}/v1/documents/embedding-profiles/profile-1/activate`, {
      method: "POST",
    });

    expect(result.status).toBe(201);
    expect(documents.activateEmbeddingProfile).toHaveBeenCalledWith(undefined, "profile-1");
  });
});

describe("DocumentsController purge route", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  async function serve(documents: Record<string, unknown>) {
    const testingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [{ provide: DocumentsService, useValue: documents }],
    }).compile();
    app = testingModule.createNestApplication();
    await app.listen(0, "127.0.0.1");
    return app.getUrl();
  }

  it("defaults to a dry run when confirm is absent", async () => {
    const documents = {
      purgeDocument: vi.fn().mockResolvedValue({ purged: false, impact: { revisions: 2 } }),
      deleteDraft: vi.fn(),
    };
    const url = await serve(documents);

    const result = await fetch(`${url}/v1/documents/doc-1/purge`, { method: "DELETE" });

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({ purged: false, impact: { revisions: 2 } });
    expect(documents.purgeDocument).toHaveBeenCalledWith(
      undefined,
      "doc-1",
      { confirm: false },
      expect.any(String), // the caller IP, recorded for the audit log line
    );
    expect(documents.deleteDraft).not.toHaveBeenCalled();
  });

  it("only confirms on the exact string, never on a truthy value", async () => {
    const purgeDocument =
      vi.fn<(user: unknown, id: string, options: { confirm: boolean }) => Promise<unknown>>();
    purgeDocument.mockResolvedValue({ purged: false });
    const url = await serve({ purgeDocument });

    for (const query of ["confirm=true", "confirm=false", "confirm=1", "confirm=yes"]) {
      await fetch(`${url}/v1/documents/doc-1/purge?${query}`, { method: "DELETE" });
    }

    expect(purgeDocument.mock.calls.map(([, , options]) => options)).toEqual([
      { confirm: true },
      { confirm: false },
      { confirm: false },
      { confirm: false },
    ]);
  });

  it("keeps the soft delete reachable on the bare document route", async () => {
    const documents = {
      deleteDraft: vi.fn().mockResolvedValue({ deleted: true }),
      purgeDocument: vi.fn(),
    };
    const url = await serve(documents);

    const result = await fetch(`${url}/v1/documents/doc-1`, { method: "DELETE" });

    expect(result.status).toBe(200);
    expect(documents.deleteDraft).toHaveBeenCalledOnce();
    expect(documents.purgeDocument).not.toHaveBeenCalled();
  });
});
