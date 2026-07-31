import { Controller, ForbiddenException, Get, Req, UnauthorizedException } from "@nestjs/common";
import { ServerAuthError } from "@qhse/auth";
import type { Request } from "express";

import { AuthenticationPort } from "../application/auth.port.js";

@Controller("api/auth-context")
export class AuthContextController {
  constructor(private readonly authentication: AuthenticationPort) {}

  @Get("organizations")
  async organizations(@Req() request: Request) {
    try {
      return await this.authentication.listActiveOrganizations(request.headers);
    } catch (error) {
      if (error instanceof ServerAuthError) {
        if (error.statusCode === 401) throw new UnauthorizedException(error.message);
        throw new ForbiddenException(error.message);
      }
      throw error;
    }
  }
}
