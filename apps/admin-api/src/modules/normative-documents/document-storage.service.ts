import {
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import {
  type DocumentStorage,
  type SignedObject,
  type SignedUploadRequest,
  sanitizeFileName,
  validateUploadMetadata,
} from "@qhse/documents";

@Injectable()
export class DocumentStorageService implements DocumentStorage {
  private readonly bucket =
    process.env["S3_DOCUMENTS_BUCKET"] ?? process.env["S3_BUCKET"] ?? "qhse-files";
  private readonly client = new S3Client({
    ...(process.env["S3_ENDPOINT"] ? { endpoint: process.env["S3_ENDPOINT"] } : {}),
    region: process.env["S3_REGION"] ?? "us-east-1",
    forcePathStyle: process.env["S3_FORCE_PATH_STYLE"] === "true",
    ...(process.env["S3_ACCESS_KEY"] && process.env["S3_SECRET_KEY"]
      ? {
          credentials: {
            accessKeyId: process.env["S3_ACCESS_KEY"],
            secretAccessKey: process.env["S3_SECRET_KEY"],
          },
        }
      : {}),
  });

  async createUploadUrl(input: SignedUploadRequest): Promise<SignedObject> {
    let extension: string;
    try {
      extension = validateUploadMetadata(
        { fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes },
        Number(process.env["DOCUMENT_MAX_UPLOAD_BYTES"] ?? 52_428_800),
      );
    } catch (error) {
      throw new UnprocessableEntityException(
        error instanceof Error ? error.message : "Invalid upload",
      );
    }
    const safeName = sanitizeFileName(input.fileName);
    const storageKey = `documents/${input.documentId}/versions/${input.versionId}/original/${input.fileId}-${safeName}`;
    const expiresIn = 300;
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ContentType: input.mimeType,
        ContentLength: input.sizeBytes,
        Metadata: { sha256: input.checksum, extension },
      }),
      { expiresIn },
    );
    return { storageKey, url, expiresAt: new Date(Date.now() + expiresIn * 1_000) };
  }

  async createDownloadUrl(storageKey: string): Promise<string> {
    if (!/^documents\/[a-zA-Z0-9_-]+\/versions\/[a-zA-Z0-9_-]+\//.test(storageKey)) {
      throw new UnprocessableEntityException("Invalid document storage key");
    }
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      { expiresIn: 300 },
    );
  }

  async verifyObject(
    storageKey: string,
    expected: { sizeBytes: number; checksum: string },
  ): Promise<void> {
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    const storedChecksum = result.Metadata?.["sha256"];
    if (result.ContentLength !== expected.sizeBytes || storedChecksum !== expected.checksum) {
      throw new UnprocessableEntityException(
        "Uploaded object does not match the declared size and checksum",
      );
    }
  }
}
