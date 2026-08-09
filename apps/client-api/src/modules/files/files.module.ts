import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { TenantContextGuard } from "../auth/authorization/tenant-context.guard.js";
import { AudioTranscriptionPort } from "./application/audio-transcription.port.js";
import { FileStorage } from "./application/file-storage.port.js";
import { FilesService } from "./application/files.service.js";
import { OpenAiAudioTranscriptionAdapter } from "./infrastructure/openai-audio-transcription.adapter.js";
import { S3FileStorageAdapter } from "./infrastructure/s3-file-storage.adapter.js";
import { FilesController } from "./presentation/files.controller.js";

@Module({
  imports: [AuthModule],
  controllers: [FilesController],
  providers: [
    FilesService,
    TenantContextGuard,
    { provide: FileStorage, useClass: S3FileStorageAdapter },
    { provide: AudioTranscriptionPort, useClass: OpenAiAudioTranscriptionAdapter },
  ],
  exports: [FileStorage, FilesService],
})
export class FilesModule {}
