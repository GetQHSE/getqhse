import { describe, expect, it } from "vitest";

import { DocumentStorageService } from "./document-storage.service.js";

describe("DocumentStorageService", () => {
  it("creates a browser-safe upload URL with metadata in the signed query", async () => {
    process.env["S3_ACCESS_KEY"] ??= "test-access-key";
    process.env["S3_SECRET_KEY"] ??= "test-secret-key";
    const checksum = "a".repeat(64);
    const signed = await new DocumentStorageService().createUploadUrl({
      documentId: "document-1",
      versionId: "version-1",
      fileId: "file-1",
      fileName: "standard.pdf",
      mimeType: "application/pdf",
      sizeBytes: 128,
      checksum,
    });
    const url = new URL(signed.url);

    expect(url.searchParams.get("x-amz-meta-sha256")).toBe(checksum);
    expect(url.searchParams.get("x-amz-meta-extension")).toBe("pdf");
    expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false);
    expect(url.searchParams.has("x-amz-sdk-checksum-algorithm")).toBe(false);
  });
});
