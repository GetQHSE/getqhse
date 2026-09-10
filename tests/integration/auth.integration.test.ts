import { readFile, readdir } from "node:fs/promises";

import { hashPassword } from "better-auth/crypto";
import { Client } from "pg";
import { GenericContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createQhseAuth, ServerAuth } from "@qhse/auth";
import { createPrismaClient, ensureBootstrapSuperAdmin, type DatabaseClient } from "@qhse/database";
import { createEmailDelivery, organizationInvitationParameters } from "@qhse/notifications";

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
      sendInvitationEmail: async (invitation) => {
        const recipient = await database.user.findUnique({
          where: { email: invitation.email },
          select: { id: true, name: true },
        });
        await createEmailDelivery(database, {
          organizationId: invitation.organization.id,
          invitationId: invitation.id,
          ...(recipient ? { recipientUserId: recipient.id, recipientName: recipient.name } : {}),
          type: "ORGANIZATION_INVITATION",
          eventKey: `${invitation.id}:${invitation.invitation.expiresAt.toISOString()}`,
          recipientEmail: invitation.email,
          entityType: "Invitation",
          entityId: invitation.id,
          parameters: organizationInvitationParameters({
            recipientEmail: invitation.email,
            inviterName: invitation.inviter.user.name,
            inviterEmail: invitation.inviter.user.email,
            organizationName: invitation.organization.name,
            role: invitation.role,
            appOrigin: "http://localhost:5173",
            invitationId: invitation.id,
            expiresAt: invitation.invitation.expiresAt,
          }),
        });
      },
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

  it("creates an email registration with a valid session", async () => {
    const registration = await authRequest("/sign-up/email", {
      name: "New User",
      email: "new-user@example.test",
      password: "correct-horse-battery-staple",
    });
    expect(registration.status).toBe(200);
    expect(mergeCookies(registration)).toContain("better-auth.session_token");
    await expect(
      database.user.findUnique({ where: { email: "new-user@example.test" } }),
    ).resolves.toMatchObject({ email: "new-user@example.test" });
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

  it("runs the invitation, resend, acceptance, role, suspension, and removal lifecycle", async () => {
    await database.emailSetting.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", organizationInvitationTemplateId: 42 },
      update: { organizationInvitationTemplateId: 42 },
    });
    const password = "correct-horse-battery-staple";
    const passwordHash = await hashPassword(password);
    const [owner, recipient, wrongUser] = await Promise.all(
      [
        ["Lifecycle Owner", "lifecycle-owner@example.test"],
        ["Lifecycle Recipient", "lifecycle-recipient@example.test"],
        ["Wrong Recipient", "wrong-recipient@example.test"],
      ].map(async ([name, email]) => {
        const user = await database.user.create({ data: { name: name!, email: email! } });
        await database.account.create({
          data: {
            accountId: user.id,
            providerId: "credential",
            userId: user.id,
            password: passwordHash,
          },
        });
        return user;
      }),
    );
    const organization = await database.organization.create({
      data: { name: "Lifecycle Organization", slug: "lifecycle-organization" },
    });
    await database.member.create({
      data: { organizationId: organization.id, userId: owner!.id, role: "owner" },
    });

    const ownerSignIn = await authRequest("/sign-in/email", { email: owner!.email, password });
    const ownerCookie = mergeCookies(ownerSignIn);
    const invitationResponse = await authRequest(
      "/organization/invite-member",
      { organizationId: organization.id, email: recipient!.email, role: "member" },
      ownerCookie,
    );
    expect(invitationResponse.status).toBe(200);
    const invitation = (await invitationResponse.json()) as { id: string; expiresAt: string };
    await expect(
      database.emailDelivery.findMany({ where: { invitationId: invitation.id } }),
    ).resolves.toHaveLength(1);

    const resend = await authRequest(
      "/organization/invite-member",
      { organizationId: organization.id, email: recipient!.email, role: "member", resend: true },
      ownerCookie,
    );
    expect(resend.status).toBe(200);
    await expect(resend.json()).resolves.toMatchObject({ id: invitation.id });
    await expect(
      database.emailDelivery.findMany({ where: { invitationId: invitation.id } }),
    ).resolves.toHaveLength(2);

    const wrongSignIn = await authRequest("/sign-in/email", { email: wrongUser!.email, password });
    expect(
      (
        await authRequest(
          "/organization/accept-invitation",
          { invitationId: invitation.id },
          mergeCookies(wrongSignIn),
        )
      ).status,
    ).toBe(403);

    const recipientSignIn = await authRequest("/sign-in/email", {
      email: recipient!.email,
      password,
    });
    const recipientCookie = mergeCookies(recipientSignIn);
    const acceptance = await authRequest(
      "/organization/accept-invitation",
      { invitationId: invitation.id },
      recipientCookie,
    );
    expect(acceptance.status).toBe(200);
    expect(
      (
        await authRequest(
          "/organization/accept-invitation",
          { invitationId: invitation.id },
          recipientCookie,
        )
      ).status,
    ).not.toBe(200);

    const membership = await database.member.findUniqueOrThrow({
      where: {
        organizationId_userId: { organizationId: organization.id, userId: recipient!.id },
      },
    });
    expect(
      (
        await authRequest(
          "/organization/update-member-role",
          { organizationId: organization.id, memberId: membership.id, role: "admin" },
          ownerCookie,
        )
      ).status,
    ).toBe(200);

    await database.member.update({ where: { id: membership.id }, data: { status: "suspended" } });
    expect(
      (
        await authRequest(
          "/organization/set-active",
          { organizationId: organization.id },
          recipientCookie,
        )
      ).status,
    ).toBe(403);
    await database.member.update({ where: { id: membership.id }, data: { status: "active" } });
    expect(
      (
        await authRequest(
          "/organization/remove-member",
          { organizationId: organization.id, memberIdOrEmail: membership.id },
          ownerCookie,
        )
      ).status,
    ).toBe(200);
    await expect(database.member.findUnique({ where: { id: membership.id } })).resolves.toBeNull();

    const cancellableResponse = await authRequest(
      "/organization/invite-member",
      { organizationId: organization.id, email: recipient!.email, role: "member" },
      ownerCookie,
    );
    const cancellable = (await cancellableResponse.json()) as { id: string };
    expect(
      (
        await authRequest(
          "/organization/cancel-invitation",
          { invitationId: cancellable.id },
          ownerCookie,
        )
      ).status,
    ).toBe(200);
    await expect(
      database.emailDelivery.findFirst({
        where: { invitationId: cancellable.id },
        orderBy: { createdAt: "desc" },
      }),
    ).resolves.toMatchObject({ status: "CANCELLED" });
    expect(
      (
        await authRequest(
          "/organization/accept-invitation",
          { invitationId: cancellable.id },
          recipientCookie,
        )
      ).status,
    ).not.toBe(200);

    const expired = await database.invitation.create({
      data: {
        email: recipient!.email,
        inviterId: owner!.id,
        organizationId: organization.id,
        role: "member",
        status: "pending",
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    expect(
      (
        await authRequest(
          "/organization/accept-invitation",
          { invitationId: expired.id },
          recipientCookie,
        )
      ).status,
    ).not.toBe(200);
  });
});
