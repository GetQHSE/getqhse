import type { DatabaseClient } from "@qhse/database";
import { describe, expect, it, vi } from "vitest";

import type { AudioTranscriptionPort } from "./audio-transcription.port.js";
import type { FileStorage } from "./file-storage.port.js";
import { FilesService } from "./files.service.js";

const tenant = { organizationId: "org-1", userId: "user-1", role: "member" };

describe("FilesService", () => {
  it("requires audio uploads to use the voice-note purpose", async () => {
    const storage = { createUploadUrl: vi.fn() } as unknown as FileStorage;
    const service = new FilesService(storage, {} as AudioTranscriptionPort, {} as DatabaseClient);
    await expect(
      service.createUpload(tenant, {
        fileName: "note.webm",
        contentType: "audio/webm",
        sizeBytes: 10,
        checksum: "a".repeat(64),
        purpose: "CHAT_ATTACHMENT",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(storage.createUploadUrl).not.toHaveBeenCalled();
  });

  it("returns a completed transcription without calling OpenAI again", async () => {
    const transcription = { transcribe: vi.fn() } as unknown as AudioTranscriptionPort;
    const database = {
      fileObject: {
        findFirst: vi.fn(async () => ({
          id: "file-1",
          organizationId: "org-1",
          objectKey: "org-1/file.webm",
          originalName: "file.webm",
          contentType: "audio/webm",
          sizeBytes: 10n,
          checksum: "a".repeat(64),
          purpose: "VOICE_NOTE",
          uploadStatus: "READY",
          verifiedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        })),
      },
      fileTranscription: {
        findUnique: vi.fn(async () => ({
          id: "transcript-1",
          fileId: "file-1",
          model: "gpt-4o-mini-transcribe",
          language: "fr",
          text: "Nous employons 42 personnes.",
          durationMs: 1_200,
          status: "COMPLETED",
          errorCode: null,
          createdAt: new Date("2026-08-09T00:00:00Z"),
          completedAt: new Date("2026-08-09T00:00:01Z"),
        })),
      },
    } as unknown as DatabaseClient;
    const service = new FilesService({} as FileStorage, transcription, database);
    const result = await service.transcribe(tenant, "file-1");
    expect(result).toMatchObject({ status: "COMPLETED", text: "Nous employons 42 personnes." });
    expect(transcription.transcribe).not.toHaveBeenCalled();
  });
});
