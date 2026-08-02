import type { IncomingHttpHeaders } from "node:http";

import type { DatabaseClient } from "@qhse/database";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { fromNodeHeaders } from "better-auth/node";
import { createAccessControl, organization } from "better-auth/plugins";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

const organizationAccessControl = createAccessControl({
  ...defaultStatements,
  project: ["create", "read", "update", "delete"],
} as const);
const organizationRoleDefinitions = {
  owner: organizationAccessControl.newRole({
    ...ownerAc.statements,
    project: ["create", "read", "update", "delete"],
  }),
  admin: organizationAccessControl.newRole({
    ...adminAc.statements,
    project: ["create", "read", "update", "delete"],
  }),
  member: organizationAccessControl.newRole({
    ...memberAc.statements,
    project: ["read"],
  }),
};

export const userStatuses = ["active", "suspended", "deleted"] as const;
export type UserStatus = (typeof userStatuses)[number];

export const organizationStatuses = ["active", "suspended", "archived"] as const;
export type OrganizationStatus = (typeof organizationStatuses)[number];

export const membershipStatuses = ["active", "suspended"] as const;
export type MembershipStatus = (typeof membershipStatuses)[number];

export const organizationRoles = ["owner", "admin", "member"] as const;
export type OrganizationRole = (typeof organizationRoles)[number];

export const platformRoles = [
  "user",
  "super_admin",
  "platform_admin",
  "support",
  "content_manager",
] as const;
export type PlatformRole = (typeof platformRoles)[number];

export const adminPlatformRoles = [
  "super_admin",
  "platform_admin",
  "support",
  "content_manager",
] as const satisfies readonly PlatformRole[];

export type QhseAuthOptions = {
  database: DatabaseClient;
  baseURL: string;
  trustedOrigins: string[];
  secureCookies?: boolean;
};

export function createQhseAuth({
  database,
  baseURL,
  trustedOrigins,
  secureCookies = false,
}: QhseAuthOptions) {
  return betterAuth({
    appName: "QHSE Platform",
    baseURL,
    basePath: "/api/auth",
    secret: process.env["BETTER_AUTH_SECRET"],
    database: prismaAdapter(database, { provider: "postgresql" }),
    trustedOrigins,
    user: {
      additionalFields: {
        firstName: { type: "string", required: false },
        lastName: { type: "string", required: false },
        status: {
          type: [...userStatuses],
          required: true,
          defaultValue: "active",
          input: false,
        },
        locale: { type: "string", required: true, defaultValue: "fr-MA" },
        timezone: {
          type: "string",
          required: true,
          defaultValue: "Africa/Casablanca",
        },
        platformRole: {
          type: [...platformRoles],
          required: true,
          defaultValue: "user",
          input: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const member = await database.member.findFirst({
              where: {
                userId: session.userId,
                status: "active",
                organization: { status: "active" },
              },
              orderBy: { createdAt: "asc" },
              select: { organizationId: true },
            });
            return {
              data: {
                ...session,
                activeOrganizationId: member?.organizationId ?? null,
              },
            };
          },
        },
      },
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        disableOrganizationDeletion: true,
        ac: organizationAccessControl,
        roles: organizationRoleDefinitions,
        schema: {
          organization: {
            additionalFields: {
              status: {
                type: [...organizationStatuses],
                required: true,
                defaultValue: "active",
                input: false,
              },
              countryCode: { type: "string", required: true, defaultValue: "MA" },
              locale: { type: "string", required: true, defaultValue: "fr-MA" },
              timezone: {
                type: "string",
                required: true,
                defaultValue: "Africa/Casablanca",
              },
              icon: { type: "string", required: false },
            },
          },
          member: {
            additionalFields: {
              status: {
                type: [...membershipStatuses],
                required: true,
                defaultValue: "active",
                input: false,
              },
            },
          },
        },
      }),
    ],
    advanced: {
      useSecureCookies: secureCookies,
      database: { generateId: "uuid" },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
      },
    },
  });
}

export type QhseAuth = ReturnType<typeof createQhseAuth>;

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  platformRole: PlatformRole;
  activeOrganizationId: string | null;
};

export type OrganizationAccess = {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
};

export type ProjectAccess = OrganizationAccess & {
  projectId: string;
};

export type ActiveOrganization = {
  id: string;
  name: string;
  slug: string;
};

export class ServerAuthError extends Error {
  constructor(
    readonly statusCode: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "ServerAuthError";
  }
}

export class ServerAuth {
  constructor(
    private readonly auth: QhseAuth,
    private readonly database: DatabaseClient,
  ) {}

  async getCurrentUser(headers: IncomingHttpHeaders): Promise<CurrentUser | null> {
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!session) return null;

    const user = await this.database.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        platformRole: true,
      },
    });
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status as UserStatus,
      platformRole: user.platformRole as PlatformRole,
      activeOrganizationId:
        (session.session as typeof session.session & { activeOrganizationId?: string | null })
          .activeOrganizationId ?? null,
    };
  }

  async requireAuth(headers: IncomingHttpHeaders): Promise<CurrentUser> {
    const user = await this.getCurrentUser(headers);
    if (!user) throw new ServerAuthError(401, "Authentication required");
    if (user.status !== "active") throw new ServerAuthError(403, "User account is not active");
    return user;
  }

  async requireOrganization(
    headers: IncomingHttpHeaders,
    requestedOrganizationId?: string,
  ): Promise<OrganizationAccess> {
    const user = await this.requireAuth(headers);
    const organizationId = requestedOrganizationId ?? user.activeOrganizationId;
    if (!organizationId) throw new ServerAuthError(403, "An active organization is required");

    const member = await this.database.member.findFirst({
      where: {
        organizationId,
        userId: user.id,
        status: "active",
        organization: { status: "active" },
      },
      select: { organizationId: true, role: true },
    });
    if (!member) throw new ServerAuthError(403, "No active organization membership");

    return {
      organizationId: member.organizationId,
      userId: user.id,
      role: member.role as OrganizationRole,
    };
  }

  async listActiveOrganizations(headers: IncomingHttpHeaders): Promise<ActiveOrganization[]> {
    const user = await this.requireAuth(headers);
    const memberships = await this.database.member.findMany({
      where: {
        userId: user.id,
        status: "active",
        organization: { status: "active" },
      },
      orderBy: { createdAt: "asc" },
      select: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
    return memberships.map(({ organization }) => organization);
  }

  async requireProject(
    headers: IncomingHttpHeaders,
    projectId: string,
    requestedOrganizationId?: string,
  ): Promise<ProjectAccess> {
    const access = await this.requireOrganization(headers, requestedOrganizationId);
    const project = await this.database.project.findFirst({
      where: {
        id: projectId,
        organizationId: access.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!project) throw new ServerAuthError(403, "Project access is not allowed");
    return { ...access, projectId: project.id };
  }

  async requireOrganizationRole(
    headers: IncomingHttpHeaders,
    roles: readonly OrganizationRole[],
    requestedOrganizationId?: string,
  ): Promise<OrganizationAccess> {
    const access = await this.requireOrganization(headers, requestedOrganizationId);
    if (!roles.includes(access.role)) {
      throw new ServerAuthError(403, "Organization role is not allowed");
    }
    return access;
  }

  async requirePlatformAdmin(
    headers: IncomingHttpHeaders,
    roles: readonly PlatformRole[] = adminPlatformRoles,
  ): Promise<CurrentUser> {
    const user = await this.requireAuth(headers);
    if (!roles.includes(user.platformRole)) {
      throw new ServerAuthError(403, "Platform administrator role is required");
    }
    return user;
  }
}
