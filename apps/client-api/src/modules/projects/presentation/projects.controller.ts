import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { createProjectSchema, paginationQuerySchema, type CreateProject } from "@qhse/contracts";

import type { QhseRequest } from "../../../common/request-context.js";
import { TenantContextGuard } from "../../auth/authorization/tenant-context.guard.js";
import { ProjectsService } from "../application/projects.service.js";

export class CreateProjectDto implements CreateProject {
  static readonly schema = createProjectSchema;
  name!: string;
  key!: string;
  description!: string | null;
}

@ApiTags("projects")
@ApiCookieAuth()
@ApiHeader({ name: "x-organization-id", required: false })
@UseGuards(TenantContextGuard)
@Controller("v1/projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOkResponse({ description: "Tenant-scoped project page" })
  list(@Req() request: QhseRequest, @Query() query: Record<string, unknown>) {
    return this.projects.list(request.tenant!, paginationQuerySchema.parse(query));
  }

  @Post()
  create(@Req() request: QhseRequest, @Body() body: CreateProjectDto) {
    return this.projects.create(request.tenant!, createProjectSchema.parse(body));
  }

  @Get(":projectId")
  get(@Req() request: QhseRequest, @Param("projectId") projectId: string) {
    return this.projects.get(request.tenant!, projectId);
  }
}
