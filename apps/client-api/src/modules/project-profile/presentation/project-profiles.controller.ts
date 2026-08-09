import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  completeProjectProfileSchema,
  projectProfileChatRequestSchema,
  projectProfileStreamRequestSchema,
  updateProjectProfileSchema,
} from "@qhse/contracts";

import type { QhseRequest } from "../../../common/request-context.js";
import type { Response } from "express";
import { TenantContextGuard } from "../../auth/authorization/tenant-context.guard.js";
import { ProjectProfilesService } from "../application/project-profiles.service.js";

@ApiTags("project-profile")
@ApiCookieAuth()
@ApiHeader({ name: "x-organization-id", required: false })
@UseGuards(TenantContextGuard)
@Controller("v1/projects/:projectIdOrSlug/profile")
export class ProjectProfilesController {
  constructor(@Inject(ProjectProfilesService) private readonly profiles: ProjectProfilesService) {}

  @Get()
  @ApiOkResponse({ description: "Canonical project profile and completion state" })
  get(@Req() request: QhseRequest, @Param("projectIdOrSlug") projectIdOrSlug: string) {
    return this.profiles.get(request.tenant!, projectIdOrSlug);
  }

  @Patch()
  update(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Body() body: unknown,
  ) {
    const parsed = updateProjectProfileSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.profiles.update(request.tenant!, projectIdOrSlug, parsed.data);
  }

  @Get("conversation")
  conversation(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Query("conversationId") conversationId?: string,
  ) {
    return this.profiles.getConversation(request.tenant!, projectIdOrSlug, conversationId);
  }

  @Post("chat")
  chat(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Body() body: unknown,
  ) {
    const parsed = projectProfileChatRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.profiles.chat(request.tenant!, projectIdOrSlug, parsed.data);
  }

  @Post("chat/stream")
  async streamChat(
    @Req() request: QhseRequest,
    @Res() response: Response,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Body() body: unknown,
  ) {
    const parsed = projectProfileStreamRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const stream = await this.profiles.streamChat(request.tenant!, projectIdOrSlug, parsed.data);
    await stream.pipe(response);
  }

  @Post("complete")
  complete(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Body() body: unknown,
  ) {
    const parsed = completeProjectProfileSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const input = parsed.data;
    return this.profiles.complete(request.tenant!, projectIdOrSlug, input.revision);
  }
}
