import { Module } from "@nestjs/common";

import { FileStorage } from "./application/file-storage.port.js";
import { S3FileStorageAdapter } from "./infrastructure/s3-file-storage.adapter.js";

@Module({
  providers: [{ provide: FileStorage, useClass: S3FileStorageAdapter }],
  exports: [FileStorage],
})
export class FilesModule {}
