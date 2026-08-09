import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { createFileUploadSchema } from "@qhse/contracts";

import type { QhseRequest } from "../../../common/request-context.js";
import { TenantContextGuard } from "../../auth/authorization/tenant-context.guard.js";
import { FilesService } from "../application/files.service.js";

@ApiTags("files")
@ApiCookieAuth()
@ApiHeader({ name: "x-organization-id", required: false })
@UseGuards(TenantContextGuard)
@Controller("v1/files")
export class FilesController {
  constructor(@Inject(FilesService) private readonly files: FilesService) {}

  @Post("uploads")
  createUpload(@Req() request: QhseRequest, @Body() body: unknown) {
    const parsed = createFileUploadSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.files.createUpload(request.tenant!, parsed.data);
  }

  @Post(":fileId/complete")
  completeUpload(@Req() request: QhseRequest, @Param("fileId") fileId: string) {
    return this.files.completeUpload(request.tenant!, fileId);
  }

  @Post(":fileId/transcription")
  transcribe(@Req() request: QhseRequest, @Param("fileId") fileId: string) {
    return this.files.transcribe(request.tenant!, fileId);
  }
}
