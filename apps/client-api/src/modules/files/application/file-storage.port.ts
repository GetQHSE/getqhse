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

export abstract class FileStorage {
  abstract createUploadUrl(request: UploadRequest): Promise<SignedUpload>;
  abstract createDownloadUrl(organizationId: string, objectKey: string): Promise<string>;
}
