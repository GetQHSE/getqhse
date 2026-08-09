import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthenticationPort } from "../../apps/client-api/src/modules/auth/application/auth.port.js";
import { TenantContextGuard } from "../../apps/client-api/src/modules/auth/authorization/tenant-context.guard.js";
import { FilesService } from "../../apps/client-api/src/modules/files/application/files.service.js";
import { FilesController } from "../../apps/client-api/src/modules/files/presentation/files.controller.js";

describe("files API", () => {
  let app: INestApplication;
  const tenant = { organizationId: "org-1", userId: "user-1", role: "member" };
  const authentication = {
    requireAuth: vi.fn(async () => ({ id: "user-1", email: "user@example.test" })),
    requireOrganization: vi.fn(async () => tenant),
  };
  const files = {
    createUpload: vi.fn(),
    completeUpload: vi.fn(),
    transcribe: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [
        TenantContextGuard,
        { provide: AuthenticationPort, useValue: authentication },
        { provide: FilesService, useValue: files },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => app.close());

  it("validates and creates a tenant-scoped upload", async () => {
    files.createUpload.mockResolvedValue({ file: { id: "file-1" }, upload: { url: "signed" } });
    await request(app.getHttpServer())
      .post("/v1/files/uploads")
      .send({
        fileName: "note.webm",
        contentType: "audio/webm",
        sizeBytes: 1024,
        checksum: "a".repeat(64),
        purpose: "VOICE_NOTE",
      })
      .expect(201);
    expect(files.createUpload).toHaveBeenCalledWith(
      tenant,
      expect.objectContaining({ purpose: "VOICE_NOTE" }),
    );
  });

  it("rejects malformed upload checksums before service execution", async () => {
    await request(app.getHttpServer())
      .post("/v1/files/uploads")
      .send({
        fileName: "document.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
        checksum: "bad",
      })
      .expect(400);
    expect(files.createUpload).not.toHaveBeenCalled();
  });

  it("forwards upload completion and transcription commands", async () => {
    files.completeUpload.mockResolvedValue({ id: "file-1", uploadStatus: "READY" });
    files.transcribe.mockResolvedValue({ id: "transcription-1", status: "COMPLETED" });
    await request(app.getHttpServer()).post("/v1/files/file-1/complete").expect(201);
    await request(app.getHttpServer()).post("/v1/files/file-1/transcription").expect(201);
    expect(files.completeUpload).toHaveBeenCalledWith(tenant, "file-1");
    expect(files.transcribe).toHaveBeenCalledWith(tenant, "file-1");
  });
});
