import { readFile, readdir } from "node:fs/promises";

import { hashPassword } from "better-auth/crypto";
import { Client } from "pg";
import { GenericContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createQhseAuth, ServerAuth } from "@qhse/auth";
import { createPrismaClient, ensureBootstrapSuperAdmin, type DatabaseClient } from "@qhse/database";

const enabled = process.env["TESTCONTAINERS_ENABLED"] === "true";
const suite = describe.skipIf(!enabled);

suite("Better Auth with PostgreSQL and Prisma", () => {
  let postgres: Awaited<ReturnType<GenericContainer["start"]>>;
  let database: DatabaseClient;
  let auth: ReturnType<typeof createQhseAuth>;

  beforeAll(async () => {
    postgres = await new GenericContainer("pgvector/pgvector:0.8.6-pg18")
      .withEnvironment({
        POSTGRES_DB: "qhse_auth_test",
        POSTGRES_USER: "qhse_test",
        POSTGRES_PASSWORD: "qhse_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();

    const databaseUrl = `postgresql://qhse_test:qhse_test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/qhse_auth_test`;
    const migrationClient = new Client({ connectionString: databaseUrl });
    await migrationClient.connect();
    const migrationsRoot = new URL("../../packages/database/prisma/migrations/", import.meta.url);
    const directories = (await readdir(migrationsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const directory of directories) {
      const sql = await readFile(new URL(`${directory}/migration.sql`, migrationsRoot), "utf8");
      await migrationClient.query(sql);
    }
    await migrationClient.end();

    process.env["BETTER_AUTH_SECRET"] =
      "integration-test-secret-with-at-least-thirty-two-characters";
    database = createPrismaClient(databaseUrl);
    auth = createQhseAuth({
      database,
      baseURL: "http://localhost:3000",
      trustedOrigins: ["http://localhost:5173"],
    });
  });

  afterAll(async () => {
    await database?.$disconnect();
    await postgres?.stop();
  });

  async function authRequest(path: string, body: object, cookie?: string) {
    return auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  }

  async function authGet(path: string, cookie?: string) {
    return auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        headers: {
          origin: "http://localhost:5173",
          ...(cookie ? { cookie } : {}),
        },
      }),
    );
  }

  function mergeCookies(response: Response, existing = "") {
    const cookies = new Map(
      existing
        .split(";")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => {
          const separator = value.indexOf("=");
          return [value.slice(0, separator), value.slice(separator + 1)] as const;
        }),
    );
    for (const setCookie of response.headers.getSetCookie()) {
      const value = setCookie.split(";")[0] ?? "";
      const separator = value.indexOf("=");
      cookies.set(value.slice(0, separator), value.slice(separator + 1));
    }
    return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  it("signs in, validates roles, switches organizations, and accepts invitations", async () => {
    const password = "correct-horse-battery-staple";
    const passwordHash = await hashPassword(password);
    const user = await database.user.create({
      data: {
        name: "Support Member",
        email: "support@example.test",
        emailVerified: true,
        platformRole: "support",
      },
    });
    await database.account.create({
      data: {
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: passwordHash,
      },
    });
    const firstOrganization = await database.organization.create({
      data: { name: "First Organization", slug: "first-organization" },
    });
    await database.member.create({
      data: {
        organizationId: firstOrganization.id,
        userId: user.id,
        role: "member",
      },
    });

    const signIn = await authRequest("/sign-in/email", {
      email: user.email,
      password,
    });
    expect(signIn.status).toBe(200);
    const cookie = mergeCookies(signIn);
    expect(cookie).toContain("better-auth.session_token");

    const serverAuth = new ServerAuth(auth, database);
    await expect(serverAuth.requireOrganization({ cookie })).resolves.toEqual({
      organizationId: firstOrganization.id,
      userId: user.id,
      role: "member",
    });
    await expect(serverAuth.requirePlatformAdmin({ cookie })).resolves.toMatchObject({
      id: user.id,
      platformRole: "support",
    });

    const secondOrganization = await database.organization.create({
      data: { name: "Second Organization", slug: "second-organization" },
    });
    const invitation = await database.invitation.create({
      data: {
        email: user.email,
        inviterId: user.id,
        organizationId: secondOrganization.id,
        role: "member",
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const acceptance = await authRequest(
      "/organization/accept-invitation",
      { invitationId: invitation.id },
      cookie,
    );
    expect(acceptance.status).toBe(200);

    const switchOrganization = await authRequest(
      "/organization/set-active",
      { organizationId: secondOrganization.id },
      cookie,
    );
    expect(switchOrganization.status).toBe(200);
    const switchedCookie = mergeCookies(switchOrganization, cookie);
    await expect(serverAuth.requireOrganization({ cookie: switchedCookie })).resolves.toMatchObject(
      {
        organizationId: secondOrganization.id,
        role: "member",
      },
    );
  });

  it("does not expose public email registration", async () => {
    const registration = await authRequest("/sign-up/email", {
      name: "Uninvited User",
      email: "uninvited@example.test",
      password: "correct-horse-battery-staple",
    });
    expect(registration.status).toBe(404);
    await expect(
      database.user.findUnique({ where: { email: "uninvited@example.test" } }),
    ).resolves.toBeNull();
  });

  it("bootstraps one super admin with a working Better Auth credential", async () => {
    const email = "bootstrap-admin@example.test";
    const password = "bootstrap-admin-password";

    await expect(ensureBootstrapSuperAdmin(database, { email, password })).resolves.toEqual({
      created: true,
      email,
    });
    await expect(ensureBootstrapSuperAdmin(database, {})).resolves.toEqual({
      created: false,
      email,
    });

    const signIn = await authRequest("/sign-in/email", { email, password });
    expect(signIn.status).toBe(200);
    const cookie = mergeCookies(signIn);
    const currentSession = await authGet("/get-session", cookie);
    expect(currentSession.status).toBe(200);
    await expect(currentSession.json()).resolves.toMatchObject({
      user: { email, platformRole: "super_admin" },
    });

    const serverAuth = new ServerAuth(auth, database);
    await expect(serverAuth.requirePlatformAdmin({ cookie })).resolves.toMatchObject({
      platformRole: "super_admin",
    });

    const signOut = await authRequest("/sign-out", {}, cookie);
    expect(signOut.status).toBe(200);
    const signedOutCookie = mergeCookies(signOut, cookie);
    await expect(
      serverAuth.requirePlatformAdmin({ cookie: signedOutCookie }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});
