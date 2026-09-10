import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ApiCookieAuth, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { ZodType } from "zod";

import {
  aiUsagePeriods,
  aiUsageQuerySchema,
  listOrganizationProjectsSchema,
  listOrganizationsSchema,
  organizationStatuses,
  projectStatuses,
} from "./organizations.contracts.js";
import { OrganizationsService } from "./organizations.service.js";

@ApiTags("organizations")
@ApiCookieAuth()
@Controller("v1/organizations")
export class OrganizationsController {
  constructor(
    @Inject(OrganizationsService)
    private readonly organizations: OrganizationsService,
  ) {}

  @Get()
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "status", required: false, enum: organizationStatuses })
  @ApiQuery({ name: "countryCode", required: false })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  list(@Query() query: Record<string, unknown>) {
    return this.organizations.list(parse(listOrganizationsSchema, query));
  }

  @Get(":organizationId")
  @ApiParam({ name: "organizationId" })
  detail(@Param("organizationId") organizationId: string) {
    return this.organizations.detail(organizationId);
  }

  @Get(":organizationId/members")
  members(@Param("organizationId") organizationId: string) {
    return this.organizations.members(organizationId);
  }

  @Get(":organizationId/projects")
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "status", required: false, enum: projectStatuses })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  projects(
    @Param("organizationId") organizationId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.organizations.projects(
      organizationId,
      parse(listOrganizationProjectsSchema, query),
    );
  }

  @Get(":organizationId/ai-usage")
  @ApiQuery({ name: "period", required: false, enum: aiUsagePeriods })
  aiUsage(
    @Param("organizationId") organizationId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.organizations.organizationAiUsage(organizationId, parse(aiUsageQuerySchema, query));
  }

  @Get(":organizationId/projects/:projectId")
  projectDetail(
    @Param("organizationId") organizationId: string,
    @Param("projectId") projectId: string,
  ) {
    return this.organizations.projectDetail(organizationId, projectId);
  }

  @Get(":organizationId/projects/:projectId/ai-usage")
  @ApiQuery({ name: "period", required: false, enum: aiUsagePeriods })
  projectAiUsage(
    @Param("organizationId") organizationId: string,
    @Param("projectId") projectId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.organizations.projectAiUsage(
      organizationId,
      projectId,
      parse(aiUsageQuerySchema, query),
    );
  }
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new UnprocessableEntityException({
      message: "Request validation failed",
      issues: result.error.issues,
    });
  }
  return result.data;
}
