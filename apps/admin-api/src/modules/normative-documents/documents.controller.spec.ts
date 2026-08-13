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
      openAiConfigured: true,
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
