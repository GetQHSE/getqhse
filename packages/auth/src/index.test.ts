import { describe, expect, it, vi } from "vitest";

import { ServerAuth, type ServerAuthError } from "./index.js";

function createHarness(options?: {
  session?: object | null;
  user?: object | null;
  member?: object | null;
}) {
  const auth = {
    api: {
      getSession: vi.fn().mockResolvedValue(
        options?.session === undefined
          ? {
              user: { id: "user-1" },
              session: { activeOrganizationId: "org-1" },
            }
          : options.session,
      ),
    },
  };
  const database = {
    user: {
      findUnique: vi.fn().mockResolvedValue(
        options?.user === undefined
          ? {
              id: "user-1",
              email: "member@example.test",
              name: "Member",
              status: "active",
              platformRole: "user",
            }
          : options.user,
      ),
    },
    member: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          options?.member === undefined
            ? { organizationId: "org-1", role: "member" }
            : options.member,
        ),
      findMany: vi.fn().mockResolvedValue([
        {
          organization: {
            id: "org-1",
            name: "Active Organization",
            slug: "active-organization",
          },
        },
      ]),
    },
  };
  return {
    serverAuth: new ServerAuth(auth as never, database as never),
    database,
  };
}

describe("ServerAuth", () => {
  it("returns 401 when no Better Auth session exists", async () => {
    const { serverAuth } = createHarness({ session: null });
    await expect(serverAuth.requireAuth({})).rejects.toMatchObject({
      statusCode: 401,
    } satisfies Partial<ServerAuthError>);
  });

  it("rejects suspended users with 403", async () => {
    const { serverAuth } = createHarness({
      user: {
        id: "user-1",
        email: "member@example.test",
        name: "Member",
        status: "suspended",
        platformRole: "user",
      },
    });
    await expect(serverAuth.requireAuth({})).rejects.toMatchObject({ statusCode: 403 });
  });

  it("validates an active membership and active organization", async () => {
    const { serverAuth, database } = createHarness();
    await expect(serverAuth.requireOrganization({})).resolves.toEqual({
      organizationId: "org-1",
      userId: "user-1",
      role: "member",
    });
    expect(database.member.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        userId: "user-1",
        status: "active",
        organization: { status: "active" },
      },
      select: { organizationId: true, role: true },
    });
  });

  it("lists only active memberships in active organizations", async () => {
    const { serverAuth, database } = createHarness();
    await expect(serverAuth.listActiveOrganizations({})).resolves.toEqual([
      {
        id: "org-1",
        name: "Active Organization",
        slug: "active-organization",
      },
    ]);
    expect(database.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          status: "active",
          organization: { status: "active" },
        },
      }),
    );
  });

  it("keeps platform roles separate from organization roles", async () => {
    const { serverAuth } = createHarness({
      user: {
        id: "user-1",
        email: "support@example.test",
        name: "Support",
        status: "active",
        platformRole: "support",
      },
      member: { organizationId: "org-1", role: "member" },
    });
    await expect(serverAuth.requirePlatformAdmin({})).resolves.toMatchObject({
      platformRole: "support",
    });
    await expect(serverAuth.requireOrganization({}, "org-1")).resolves.toMatchObject({
      role: "member",
    });
  });

  it("rejects a normal user from platform administration", async () => {
    const { serverAuth } = createHarness();
    await expect(serverAuth.requirePlatformAdmin({})).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
