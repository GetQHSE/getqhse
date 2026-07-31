import { extname } from "node:path";

export const allowedDocumentTypes = new Map<string, readonly string[]>([
  ["application/pdf", [".pdf"]],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", [".docx"]],
  ["text/plain", [".txt"]],
  ["text/markdown", [".md", ".markdown"]],
  ["text/csv", [".csv"]],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", [".xlsx"]],
  ["image/png", [".png"]],
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/tiff", [".tif", ".tiff"]],
]);

export function sanitizeFileName(fileName: string): string {
  const leaf = fileName.replaceAll("\\", "/").split("/").at(-1) ?? "document";
  return (
    leaf
      .normalize("NFKC")
      .replace(/[^a-zA-Z0-9._ -]/g, "_")
      .replace(/\.{2,}/g, ".")
      .slice(0, 180) || "document"
  );
}

export function validateUploadMetadata(
  input: { fileName: string; mimeType: string; sizeBytes: number },
  maximumBytes: number,
): string {
  if (
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > maximumBytes
  ) {
    throw new Error("Invalid file size");
  }
  const allowedExtensions = allowedDocumentTypes.get(input.mimeType);
  const extension = extname(sanitizeFileName(input.fileName)).toLowerCase();
  if (!allowedExtensions?.includes(extension))
    throw new Error("File extension and MIME type do not match");
  return extension.slice(1);
}

export type SignedUploadRequest = {
  documentId: string;
  versionId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
};

export type SignedObject = { url: string; storageKey: string; expiresAt: Date };

export interface DocumentStorage {
  createUploadUrl(input: SignedUploadRequest): Promise<SignedObject>;
  createDownloadUrl(storageKey: string): Promise<string>;
  verifyObject(
    storageKey: string,
    expected: { sizeBytes: number; checksum: string },
  ): Promise<void>;
}
