import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Inject,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiCookieAuth, ApiHeader } from "@nestjs/swagger";
import {
  processSheetPrepareSchema,
  processSheetWriteSchema,
  processSheetLaunchSchema,
} from "@qhse/contracts";
import type { z } from "zod";
import type { QhseRequest } from "../../../common/request-context.js";
import { TenantContextGuard } from "../../auth/authorization/tenant-context.guard.js";
import { ProcessSheetsService } from "../application/process-sheets.service.js";
const parse = <T>(schema: z.ZodType<T>, value: unknown) => {
  const r = schema.safeParse(value);
  if (!r.success) throw new BadRequestException(r.error);
  return r.data;
};
@ApiTags("process-sheets")
@ApiCookieAuth()
@ApiHeader({ name: "x-organization-id", required: false })
@UseGuards(TenantContextGuard)
@Controller("v1/projects/:projectIdOrSlug/process-sheets")
export class ProcessSheetsController {
  constructor(@Inject(ProcessSheetsService) private readonly sheets: ProcessSheetsService) {}
  @Get() register(@Req() req: QhseRequest, @Param("projectIdOrSlug") id: string) {
    return this.sheets.register(req.tenant!, id);
  }
  @Post() prepare(
    @Req() req: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Body() body: unknown,
  ) {
    return this.sheets.prepare(req.tenant!, id, parse(processSheetPrepareSchema, body).processId);
  }
  @Post(":sheetId/review") write(
    @Req() req: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Param("sheetId") sheetId: string,
    @Body() body: unknown,
  ) {
    return this.sheets.write(req.tenant!, id, sheetId, parse(processSheetWriteSchema, body));
  }
  @Post(":sheetId/runs") launch(
    @Req() req: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Param("sheetId") sheetId: string,
    @Body() body: unknown,
  ) {
    return this.sheets.launch(
      req.tenant!,
      id,
      sheetId,
      parse(processSheetLaunchSchema, body).revision,
    );
  }
  @Get("versions/:versionId/export") export(
    @Req() req: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Param("versionId") versionId: string,
  ) {
    return this.sheets.exportVersion(req.tenant!, id, versionId);
  }
}
