import { randomUUID } from "node:crypto";

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BadRequestException, Injectable } from "@nestjs/common";

import {
  FileStorage,
  type SignedUpload,
  type UploadRequest,
} from "../application/file-storage.port.js";

const permittedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/m4a",
]);
const s3Endpoint = process.env["S3_ENDPOINT"];
const s3AccessKey = process.env["S3_ACCESS_KEY"];
const s3SecretKey = process.env["S3_SECRET_KEY"];

@Injectable()
export class S3FileStorageAdapter extends FileStorage {
  private readonly bucket = process.env["S3_BUCKET"] ?? "qhse-files";
  private readonly client = new S3Client({
    ...(s3Endpoint ? { endpoint: s3Endpoint } : {}),
    region: process.env["S3_REGION"] ?? "us-east-1",
    forcePathStyle: process.env["S3_FORCE_PATH_STYLE"] === "true",
    ...(s3AccessKey && s3SecretKey
      ? { credentials: { accessKeyId: s3AccessKey, secretAccessKey: s3SecretKey } }
      : {}),
  });

  async createUploadUrl(request: UploadRequest): Promise<SignedUpload> {
    const maximum = Number(process.env["MAX_UPLOAD_BYTES"] ?? 10_485_760);
    if (!permittedTypes.has(request.contentType)) {
      throw new BadRequestException("Unsupported file type");
    }
    if (
      !Number.isSafeInteger(request.sizeBytes) ||
      request.sizeBytes <= 0 ||
      request.sizeBytes > maximum
    ) {
      throw new BadRequestException("Invalid file size");
    }
    if (!/^[a-fA-F0-9]{64}$/.test(request.checksum)) {
      throw new BadRequestException("A SHA-256 checksum is required");
    }

    const extension =
      request.fileName
        .split(".")
        .at(-1)
        ?.replace(/[^a-zA-Z0-9]/g, "") ?? "bin";
    const objectKey = `${request.organizationId}/${randomUUID()}.${extension.toLowerCase()}`;
    const expiresIn = 300;
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ContentType: request.contentType,
        ContentLength: request.sizeBytes,
        ChecksumSHA256: Buffer.from(request.checksum, "hex").toString("base64"),
        Metadata: { organizationId: request.organizationId, checksumHex: request.checksum },
      }),
      { expiresIn },
    );
    return { objectKey, url, expiresAt: new Date(Date.now() + expiresIn * 1_000) };
  }

  async createDownloadUrl(organizationId: string, objectKey: string): Promise<string> {
    this.assertOwnership(organizationId, objectKey);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn: 300 },
    );
  }

  async inspectObject(organizationId: string, objectKey: string) {
    this.assertOwnership(organizationId, objectKey);
    const object = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    return {
      contentType: object.ContentType ?? null,
      sizeBytes: object.ContentLength ?? 0,
      checksum: object.Metadata?.["checksumhex"] ?? null,
    };
  }

  async readObject(organizationId: string, objectKey: string): Promise<Uint8Array> {
    this.assertOwnership(organizationId, objectKey);
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    if (!object.Body) throw new BadRequestException("Stored file is empty");
    return object.Body.transformToByteArray();
  }

  private assertOwnership(organizationId: string, objectKey: string): void {
    if (!objectKey.startsWith(`${organizationId}/`)) {
      throw new BadRequestException("The object does not belong to this organization");
    }
  }
}
