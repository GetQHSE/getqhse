import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type { CreateFileUpload } from "@qhse/contracts";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";

import type { TenantContext } from "../../../common/request-context.js";
import { AudioTranscriptionPort } from "./audio-transcription.port.js";
import { FileStorage } from "./file-storage.port.js";

const audioTypes = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/m4a",
]);

function toFileContract(file: {
  id: string;
  originalName: string;
  contentType: string;
  sizeBytes: bigint;
  checksum: string;
  purpose: string;
  uploadStatus: string;
  verifiedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: file.id,
    originalName: file.originalName,
    contentType: file.contentType,
    sizeBytes: Number(file.sizeBytes),
    checksum: file.checksum,
    purpose: file.purpose,
    uploadStatus: file.uploadStatus,
    verifiedAt: file.verifiedAt?.toISOString() ?? null,
    createdAt: file.createdAt.toISOString(),
  };
}

@Injectable()
export class FilesService {
  private readonly database: DatabaseClient;

  constructor(
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Inject(AudioTranscriptionPort) private readonly transcription: AudioTranscriptionPort,
    @Optional() database?: DatabaseClient,
  ) {
    this.database = database ?? createPrismaClient();
  }

  async createUpload(tenant: TenantContext, input: CreateFileUpload) {
    if (input.purpose === "VOICE_NOTE" && !audioTypes.has(input.contentType)) {
      throw new BadRequestException("Voice notes must use a supported audio format");
    }
    if (input.purpose !== "VOICE_NOTE" && audioTypes.has(input.contentType)) {
      throw new BadRequestException("Audio files must be uploaded as voice notes");
    }
    const upload = await this.storage.createUploadUrl({
      organizationId: tenant.organizationId,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      checksum: input.checksum.toLowerCase(),
    });
    const file = await this.database.fileObject.create({
      data: {
        organizationId: tenant.organizationId,
        objectKey: upload.objectKey,
        originalName: input.fileName,
        contentType: input.contentType,
        sizeBytes: BigInt(input.sizeBytes),
        checksum: input.checksum.toLowerCase(),
        purpose: input.purpose,
        uploadedById: tenant.userId,
      },
    });
    return {
      file: toFileContract(file),
      upload: { url: upload.url, expiresAt: upload.expiresAt.toISOString() },
    };
  }

  async completeUpload(tenant: TenantContext, fileId: string) {
    const file = await this.findFile(tenant, fileId);
    if (file.uploadStatus === "READY") return toFileContract(file);
    if (file.uploadStatus === "REJECTED") {
      throw new ConflictException("The upload was rejected and cannot be completed");
    }
    let object;
    try {
      object = await this.storage.inspectObject(tenant.organizationId, file.objectKey);
    } catch {
      throw new BadRequestException("The uploaded object is not available");
    }
    const valid =
      object.sizeBytes === Number(file.sizeBytes) &&
      object.contentType === file.contentType &&
      (!object.checksum || object.checksum.toLowerCase() === file.checksum.toLowerCase());
    if (!valid) {
      await this.database.fileObject.update({
        where: { id: file.id },
        data: { uploadStatus: "REJECTED" },
      });
      throw new BadRequestException("Uploaded file metadata does not match the upload request");
    }
    const ready = await this.database.fileObject.update({
      where: { id: file.id },
      data: { uploadStatus: "READY", verifiedAt: new Date() },
    });
    return toFileContract(ready);
  }

  async transcribe(tenant: TenantContext, fileId: string) {
    const file = await this.findFile(tenant, fileId);
    if (file.uploadStatus !== "READY") throw new ConflictException("File upload is not ready");
    if (file.purpose !== "VOICE_NOTE" || !audioTypes.has(file.contentType)) {
      throw new BadRequestException("Only ready voice notes can be transcribed");
    }
    const model = process.env["OPENAI_TRANSCRIPTION_MODEL"] ?? "gpt-4o-mini-transcribe";
    const existing = await this.database.fileTranscription.findUnique({
      where: { fileId_model: { fileId: file.id, model } },
    });
    if (existing?.status === "COMPLETED") return this.toTranscriptionContract(existing);
    if (existing?.status === "PENDING") {
      throw new ConflictException("Voice note transcription is already in progress");
    }
    const record = await this.database.fileTranscription.upsert({
      where: { fileId_model: { fileId: file.id, model } },
      create: { fileId: file.id, model, status: "PENDING" },
      update: { status: "PENDING", errorCode: null, text: null, completedAt: null },
    });
    try {
      const audio = await this.storage.readObject(tenant.organizationId, file.objectKey);
      const result = await this.transcription.transcribe(audio);
      const completed = await this.database.fileTranscription.update({
        where: { id: record.id },
        data: {
          language: result.language,
          text: result.text,
          durationMs: result.durationMs,
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
      return this.toTranscriptionContract(completed);
    } catch (error) {
      await this.database.fileTranscription.update({
        where: { id: record.id },
        data: {
          status: "FAILED",
          errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private async findFile(tenant: TenantContext, fileId: string) {
    const file = await this.database.fileObject.findFirst({
      where: { id: fileId, organizationId: tenant.organizationId, deletedAt: null },
    });
    if (!file) throw new NotFoundException("File not found");
    return file;
  }

  private toTranscriptionContract(transcription: {
    id: string;
    fileId: string;
    model: string;
    language: string | null;
    text: string | null;
    durationMs: number | null;
    status: string;
    createdAt: Date;
    completedAt: Date | null;
  }) {
    return {
      ...transcription,
      createdAt: transcription.createdAt.toISOString(),
      completedAt: transcription.completedAt?.toISOString() ?? null,
    };
  }
}
