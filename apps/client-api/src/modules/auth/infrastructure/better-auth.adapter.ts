import type { IncomingHttpHeaders } from "node:http";

import { Injectable } from "@nestjs/common";
import {
  type ActiveOrganization,
  createQhseAuth,
  ServerAuth,
  type CurrentUser,
  type OrganizationAccess,
  type OrganizationRole,
  type PlatformRole,
} from "@qhse/auth";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";
import { toNodeHandler } from "better-auth/node";

import { AuthenticationPort } from "../application/auth.port.js";

@Injectable()
export class BetterAuthAdapter extends AuthenticationPort {
  readonly database: DatabaseClient;
  readonly auth: ReturnType<typeof createQhseAuth>;
  readonly nodeHandler: ReturnType<typeof toNodeHandler>;
  private readonly serverAuth: ServerAuth;

  constructor() {
    super();
    this.database = createPrismaClient();
    this.auth = createQhseAuth({
      database: this.database,
      baseURL: process.env["BETTER_AUTH_URL"] ?? "http://localhost:3000",
      trustedOrigins: (process.env["CORS_ORIGINS"] ?? "http://localhost:5173")
        .split(",")
        .map((origin) => origin.trim()),
      secureCookies: process.env["COOKIE_SECURE"] === "true",
    });
    this.nodeHandler = toNodeHandler(this.auth);
    this.serverAuth = new ServerAuth(this.auth, this.database);
  }

  getCurrentUser(headers: IncomingHttpHeaders): Promise<CurrentUser | null> {
    return this.serverAuth.getCurrentUser(headers);
  }

  requireAuth(headers: IncomingHttpHeaders): Promise<CurrentUser> {
    return this.serverAuth.requireAuth(headers);
  }

  requireOrganization(
    headers: IncomingHttpHeaders,
    requestedOrganizationId?: string,
  ): Promise<OrganizationAccess> {
    return this.serverAuth.requireOrganization(headers, requestedOrganizationId);
  }

  listActiveOrganizations(headers: IncomingHttpHeaders): Promise<ActiveOrganization[]> {
    return this.serverAuth.listActiveOrganizations(headers);
  }

  requireOrganizationRole(
    headers: IncomingHttpHeaders,
    roles: readonly OrganizationRole[],
    requestedOrganizationId?: string,
  ): Promise<OrganizationAccess> {
    return this.serverAuth.requireOrganizationRole(headers, roles, requestedOrganizationId);
  }

  requirePlatformAdmin(
    headers: IncomingHttpHeaders,
    roles?: readonly PlatformRole[],
  ): Promise<CurrentUser> {
    return this.serverAuth.requirePlatformAdmin(headers, roles);
  }
}
