import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ServerAuthError } from "@qhse/auth";

import { PUBLIC_ROUTE_KEY } from "../../common/public.decorator.js";
import type { AdminRequest } from "../../common/request-context.js";
import { AuthService } from "./auth.service.js";

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(AuthService)
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AdminRequest>();
    try {
      request.platformUser = await this.auth.requirePlatformAdmin(request.headers);
      return true;
    } catch (error) {
      if (error instanceof ServerAuthError) {
        if (error.statusCode === 401) throw new UnauthorizedException(error.message);
        throw new ForbiddenException(error.message);
      }
      throw error;
    }
  }
}
