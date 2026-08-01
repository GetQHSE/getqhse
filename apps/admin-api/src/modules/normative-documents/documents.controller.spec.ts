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
