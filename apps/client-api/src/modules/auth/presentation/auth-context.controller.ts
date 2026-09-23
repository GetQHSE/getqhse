import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Patch,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ServerAuthError } from "@qhse/auth";
import { updateUserPreferencesSchema, type UserPreferences } from "@qhse/contracts";
import type { Request } from "express";
import { ZodError } from "zod";

import { AuthenticationPort } from "../application/auth.port.js";
import { UserPreferencesService } from "../application/user-preferences.service.js";

export class UpdateUserPreferencesDto implements UserPreferences {
  static readonly schema = updateUserPreferencesSchema;
  locale!: UserPreferences["locale"];
}

function rethrowAuthError(error: unknown): never {
  if (error instanceof ServerAuthError) {
    if (error.statusCode === 401) throw new UnauthorizedException(error.message);
    throw new ForbiddenException(error.message);
  }
  if (error instanceof ZodError) throw new BadRequestException(error.issues);
  throw error;
}

@Controller("api/auth-context")
export class AuthContextController {
  constructor(
    @Inject(AuthenticationPort) private readonly authentication: AuthenticationPort,
    @Inject(UserPreferencesService) private readonly preferences: UserPreferencesService,
  ) {}

  @Get("organizations")
  async organizations(@Req() request: Request) {
    try {
      return await this.authentication.listActiveOrganizations(request.headers);
    } catch (error) {
      rethrowAuthError(error);
    }
  }

  @Get("preferences")
  async getPreferences(@Req() request: Request): Promise<UserPreferences> {
    try {
      return await this.preferences.get(request.headers);
    } catch (error) {
      rethrowAuthError(error);
    }
  }

  @Patch("preferences")
  async updatePreferences(
    @Req() request: Request,
    @Body() body: UpdateUserPreferencesDto,
  ): Promise<UserPreferences> {
    try {
      return await this.preferences.update(request.headers, body);
    } catch (error) {
      rethrowAuthError(error);
    }
  }
}
