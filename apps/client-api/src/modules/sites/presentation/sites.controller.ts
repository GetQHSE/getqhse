import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { createSiteSchema, paginationQuerySchema, type CreateSite } from "@qhse/contracts";

import type { QhseRequest } from "../../../common/request-context.js";
import { TenantContextGuard } from "../../auth/authorization/tenant-context.guard.js";
import { SitesService } from "../application/sites.service.js";

export class CreateSiteDto implements CreateSite {
  static readonly schema = createSiteSchema;
  name!: string;
  code!: string;
  address!: string | null;
}

@ApiTags("sites")
@ApiCookieAuth()
@ApiHeader({ name: "x-organization-id", required: false })
@UseGuards(TenantContextGuard)
@Controller("v1/sites")
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  @ApiOkResponse({ description: "Tenant-scoped site page" })
  list(@Req() request: QhseRequest, @Query() query: Record<string, unknown>) {
    return this.sites.list(request.tenant!, paginationQuerySchema.parse(query));
  }

  @Post()
  create(@Req() request: QhseRequest, @Body() body: CreateSiteDto) {
    return this.sites.create(request.tenant!, body);
  }
}
