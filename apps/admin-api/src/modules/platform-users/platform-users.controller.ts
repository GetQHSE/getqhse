import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { ZodType } from "zod";

import type { AdminRequest } from "../../common/request-context.js";
import {
  createPlatformUserSchema,
  listPlatformUsersSchema,
  type PlatformOperator,
  updatePlatformUserSchema,
} from "./platform-users.contracts.js";
import { PlatformUsersService } from "./platform-users.service.js";

@ApiTags("platform-users")
@ApiCookieAuth()
@Controller("v1/platform-users")
export class PlatformUsersController {
  constructor(
    @Inject(PlatformUsersService)
    private readonly users: PlatformUsersService,
  ) {}

  @Get()
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({
    name: "role",
    required: false,
    enum: ["platform_admin", "content_manager", "support"],
  })
  @ApiQuery({ name: "status", required: false, enum: ["active", "suspended"] })
  list(
    @Req() request: AdminRequest,
    @Query() query: Record<string, unknown>,
  ): Promise<PlatformOperator[]> {
    return this.users.list(request.platformUser!, parse(listPlatformUsersSchema, query));
  }

  @Post()
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["firstName", "lastName", "email", "password", "platformRole"],
      properties: {
        firstName: { type: "string", minLength: 1, maxLength: 100 },
        lastName: { type: "string", minLength: 1, maxLength: 100 },
        email: { type: "string", format: "email", maxLength: 320 },
        password: { type: "string", format: "password", minLength: 12, maxLength: 128 },
        platformRole: {
          type: "string",
          enum: ["platform_admin", "content_manager", "support"],
        },
        locale: { type: "string", default: "fr-MA" },
        timezone: { type: "string", default: "Africa/Casablanca" },
      },
    },
  })
  create(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.users.create(request.platformUser!, parse(createPlatformUserSchema, body));
  }

  @Patch(":userId")
  @ApiParam({ name: "userId", type: String })
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        firstName: { type: "string", minLength: 1, maxLength: 100 },
        lastName: { type: "string", minLength: 1, maxLength: 100 },
        password: { type: "string", format: "password", minLength: 12, maxLength: 128 },
        platformRole: {
          type: "string",
          enum: ["platform_admin", "content_manager", "support"],
        },
        status: { type: "string", enum: ["active", "suspended"] },
        locale: { type: "string" },
        timezone: { type: "string" },
      },
    },
  })
  update(@Req() request: AdminRequest, @Param("userId") userId: string, @Body() body: unknown) {
    return this.users.update(request.platformUser!, userId, parse(updatePlatformUserSchema, body));
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
