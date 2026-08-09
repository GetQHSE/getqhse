import {
  CanActivate,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ServerAuthError } from "@qhse/auth";

import type { QhseRequest } from "../../../common/request-context.js";
import { AuthenticationPort } from "../application/auth.port.js";

type HttpExecutionContext = Parameters<CanActivate["canActivate"]>[0];

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(@Inject(AuthenticationPort) private readonly authentication: AuthenticationPort) {}

  async canActivate(context: HttpExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<QhseRequest>();
    const requestedOrganization = request.header("x-organization-id");
    try {
      const user = await this.authentication.requireAuth(request.headers);
      const membership = await this.authentication.requireOrganization(
        request.headers,
        requestedOrganization,
      );
      request.authenticatedUser = { id: user.id, email: user.email };
      request.tenant = membership;
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
