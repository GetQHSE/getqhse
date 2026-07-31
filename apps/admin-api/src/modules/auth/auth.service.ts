import type { IncomingHttpHeaders } from "node:http";

import { Injectable } from "@nestjs/common";
import { createQhseAuth, ServerAuth, type CurrentUser, type PlatformRole } from "@qhse/auth";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";
import { toNodeHandler } from "better-auth/node";

@Injectable()
export class AuthService {
  readonly database: DatabaseClient;
  readonly auth: ReturnType<typeof createQhseAuth>;
  readonly nodeHandler: ReturnType<typeof toNodeHandler>;
  private readonly serverAuth: ServerAuth;

  constructor() {
    this.database = createPrismaClient();
    this.auth = createQhseAuth({
      database: this.database,
      baseURL: process.env["ADMIN_BETTER_AUTH_URL"] ?? "http://localhost:3001",
      trustedOrigins: (process.env["ADMIN_CORS_ORIGINS"] ?? "http://localhost:5174")
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

  requirePlatformAdmin(
    headers: IncomingHttpHeaders,
    roles?: readonly PlatformRole[],
  ): Promise<CurrentUser> {
    return this.serverAuth.requirePlatformAdmin(headers, roles);
  }
}
