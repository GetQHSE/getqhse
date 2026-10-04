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
import { scopeWriteSchema, scopeLaunchSchema } from "@qhse/contracts";
import type { z } from "zod";
import type { QhseRequest } from "../../../common/request-context.js";
import { TenantContextGuard } from "../../auth/authorization/tenant-context.guard.js";
import { ScopeService } from "../application/scope.service.js";
const parse = <T>(schema: z.ZodType<T>, body: unknown) => {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error);
  return r.data;
};
@ApiTags("qms-scope")
@ApiCookieAuth()
@ApiHeader({ name: "x-organization-id", required: false })
@UseGuards(TenantContextGuard)
@Controller("v1/projects/:projectIdOrSlug/scope")
export class ScopeController {
  constructor(@Inject(ScopeService) private readonly scope: ScopeService) {}
  @Get() register(@Req() req: QhseRequest, @Param("projectIdOrSlug") id: string) {
    return this.scope.register(req.tenant!, id);
  }
  @Post("review") write(
    @Req() req: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Body() body: unknown,
  ) {
    return this.scope.write(req.tenant!, id, parse(scopeWriteSchema, body));
  }
  @Post("runs") launch(
    @Req() req: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Body() body: unknown,
  ) {
    return this.scope.launch(req.tenant!, id, parse(scopeLaunchSchema, body));
  }
  @Get("versions/:statementId/export") export(
    @Req() req: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Param("statementId") statementId: string,
  ) {
    return this.scope.exportVersion(req.tenant!, id, statementId);
  }
}
