import type { IncomingHttpHeaders } from "node:http";

import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  toSupportedLanguage,
  updateUserPreferencesSchema,
  type UserPreferences,
} from "@qhse/contracts";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";

import { AuthenticationPort } from "./auth.port.js";

/**
 * Per-user interface preferences. `User.locale` holds the interface language
 * only; AI generations follow the project's own language instead.
 */
@Injectable()
export class UserPreferencesService {
  private readonly database: DatabaseClient;

  constructor(
    @Inject(AuthenticationPort) private readonly authentication: AuthenticationPort,
    @Optional() database?: DatabaseClient,
  ) {
    this.database = database ?? createPrismaClient();
  }

  async get(headers: IncomingHttpHeaders): Promise<UserPreferences> {
    const user = await this.authentication.requireAuth(headers);
    const record = await this.database.user.findUnique({
      where: { id: user.id },
      select: { locale: true },
    });
    return { locale: toSupportedLanguage(record?.locale) };
  }

  async update(headers: IncomingHttpHeaders, body: unknown): Promise<UserPreferences> {
    const user = await this.authentication.requireAuth(headers);
    const input = updateUserPreferencesSchema.parse(body);
    await this.database.user.update({ where: { id: user.id }, data: { locale: input.locale } });
    return input;
  }
}
