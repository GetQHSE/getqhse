export type UploadRequest = {
  organizationId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  checksum: string;
};

export type SignedUpload = {
  objectKey: string;
  url: string;
  expiresAt: Date;
};

export type StoredObjectInfo = {
  contentType: string | null;
  sizeBytes: number;
  checksum: string | null;
};

export abstract class FileStorage {
  abstract createUploadUrl(request: UploadRequest): Promise<SignedUpload>;
  abstract createDownloadUrl(organizationId: string, objectKey: string): Promise<string>;
  abstract inspectObject(organizationId: string, objectKey: string): Promise<StoredObjectInfo>;
  abstract readObject(organizationId: string, objectKey: string): Promise<Uint8Array>;
}
