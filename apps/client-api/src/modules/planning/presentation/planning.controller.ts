import type { Response } from "express";
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Inject,
  Res,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiCookieAuth, ApiHeader } from "@nestjs/swagger";
import { planningModuleSchema, planningWriteSchema, planningLaunchSchema } from "@qhse/contracts";
import type { z } from "zod";
import type { QhseRequest } from "../../../common/request-context.js";
import { TenantContextGuard } from "../../auth/authorization/tenant-context.guard.js";
import { PlanningService } from "../application/planning.service.js";
const parse = <T>(schema: z.ZodType<T>, body: unknown) => {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error);
  return r.data;
};
@ApiTags("qms-planning")
@ApiCookieAuth()
@ApiHeader({ name: "x-organization-id", required: false })
@UseGuards(TenantContextGuard)
@Controller("v1/projects/:projectIdOrSlug/planning/:module")
export class PlanningController {
  constructor(@Inject(PlanningService) private readonly planning: PlanningService) {}
  @Get() register(
    @Req() req: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Param("module") module: string,
  ) {
    return this.planning.register(req.tenant!, id, parse(planningModuleSchema, module));
  }
  @Get("versions/:versionId/export.xlsx") async export(
    @Req() req: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Param("module") module: string,
    @Param("versionId") versionId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.planning.exportExcel(
      req.tenant!,
      id,
      parse(planningModuleSchema, module),
      versionId,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", 'attachment; filename="quality-planning.xlsx"');
    res.send(buffer);
  }
  @Post("review") write(
    @Req() req: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Param("module") module: string,
    @Body() body: unknown,
  ) {
    return this.planning.write(
      req.tenant!,
      id,
      parse(planningModuleSchema, module),
      parse(planningWriteSchema, body),
    );
  }
  @Post("runs") launch(
    @Req() req: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Param("module") module: string,
    @Body() body: unknown,
  ) {
    return this.planning.launch(
      req.tenant!,
      id,
      parse(planningModuleSchema, module),
      parse(planningLaunchSchema, body),
    );
  }
}
