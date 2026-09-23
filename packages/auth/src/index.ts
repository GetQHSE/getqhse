import type { IncomingHttpHeaders } from "node:http";

import type { DatabaseClient } from "@qhse/database";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
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

export type OrganizationMutation = "invite" | "change_role" | "suspend" | "remove";

export function organizationMutationViolation(input: {
  actorRole: OrganizationRole;
  actorUserId: string;
  mutation: OrganizationMutation;
  requestedRole?: OrganizationRole;
  targetRole?: OrganizationRole;
  targetUserId?: string;
  activeOwnerCount?: number;
}): string | null {
  if (input.actorRole === "member") return "Organization management is required";
  if (
    input.actorRole === "admin" &&
    (input.requestedRole === "owner" || input.targetRole === "owner")
  ) {
    return "Administrators cannot manage owners";
  }
  if (
    (input.mutation === "suspend" || input.mutation === "remove") &&
    input.targetUserId === input.actorUserId
  ) {
    return `You cannot ${input.mutation} yourself`;
  }
  if (
    input.targetRole === "owner" &&
    input.requestedRole !== "owner" &&
    (input.mutation === "change_role" ||
      input.mutation === "suspend" ||
      input.mutation === "remove") &&
    (input.activeOwnerCount ?? 0) <= 1
  ) {
    const operation =
      input.mutation === "change_role"
        ? "demoted"
        : input.mutation === "suspend"
          ? "suspended"
          : "removed";
    return `The final active owner cannot be ${operation}`;
  }
  return null;
}

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
  sendInvitationEmail?: (data: InvitationEmailInput) => Promise<void>;
};

export type InvitationEmailInput = {
  id: string;
  role: string;
  email: string;
  organization: { id: string; name: string };
  invitation: { id: string; expiresAt: Date };
  inviter: { user: { id: string; name: string; email: string } };
};

export function createQhseAuth({
  database,
  baseURL,
  trustedOrigins,
  secureCookies = false,
  sendInvitationEmail,
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
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (!context.path.startsWith("/organization/")) return;
        const session = await getSessionFromCtx(context);
        if (!session) return;
        const body = (context.body ?? {}) as Record<string, unknown>;
        const query = (context.query ?? {}) as Record<string, unknown>;
        const sessionRecord = session.session as unknown as Record<string, unknown>;
        const sessionUser = session.user as unknown as { id: string };
        const activeOrganizationId = sessionRecord["activeOrganizationId"];
        const organizationId =
          (typeof body["organizationId"] === "string" ? body["organizationId"] : undefined) ??
          (typeof query["organizationId"] === "string" ? query["organizationId"] : undefined) ??
          (typeof activeOrganizationId === "string" ? activeOrganizationId : undefined);
        if (!organizationId) return;
        const membership = await database.member.findUnique({
          where: { organizationId_userId: { organizationId, userId: sessionUser.id } },
          select: { id: true, role: true, status: true },
        });
        if (membership?.status === "suspended") {
          throw APIError.from("FORBIDDEN", {
            code: "ORGANIZATION_MEMBERSHIP_SUSPENDED",
            message: "Organization membership is suspended",
          });
        }
        if (!membership) return;

        let mutation: OrganizationMutation | null = null;
        let requestedRole: OrganizationRole | undefined;
        let target: { role: string; userId: string; status: string } | null = null;
        if (context.path === "/organization/invite-member") {
          mutation = "invite";
          const roles: unknown = body["role"];
          const role: unknown = Array.isArray(roles) ? (roles as unknown[])[0] : roles;
          if (typeof role === "string" && organizationRoles.includes(role as OrganizationRole)) {
            requestedRole = role as OrganizationRole;
          }
        } else if (context.path === "/organization/update-member-role") {
          mutation = "change_role";
          const roles: unknown = body["role"];
          const role: unknown = Array.isArray(roles) ? (roles as unknown[])[0] : roles;
          if (typeof role === "string" && organizationRoles.includes(role as OrganizationRole)) {
            requestedRole = role as OrganizationRole;
          }
          if (typeof body["memberId"] === "string") {
            target = await database.member.findFirst({
              where: { id: body["memberId"], organizationId },
              select: { role: true, userId: true, status: true },
            });
          }
        } else if (context.path === "/organization/remove-member") {
          mutation = "remove";
          const memberIdOrEmail = body["memberIdOrEmail"];
          if (typeof memberIdOrEmail === "string") {
            target = await database.member.findFirst({
              where: {
                organizationId,
                ...(memberIdOrEmail.includes("@")
                  ? { user: { email: memberIdOrEmail.toLowerCase() } }
                  : { id: memberIdOrEmail }),
              },
              select: { role: true, userId: true, status: true },
            });
          }
        }
        if (mutation) {
          const targetRole = target?.role as OrganizationRole | undefined;
          const activeOwnerCount =
            targetRole === "owner"
              ? await database.member.count({
                  where: { organizationId, role: "owner", status: "active" },
                })
              : undefined;
          const violation = organizationMutationViolation({
            actorRole: membership.role as OrganizationRole,
            actorUserId: sessionUser.id,
            mutation,
            ...(requestedRole ? { requestedRole } : {}),
            ...(target
              ? { targetRole: target.role as OrganizationRole, targetUserId: target.userId }
              : {}),
            ...(activeOwnerCount !== undefined ? { activeOwnerCount } : {}),
          });
          if (violation) {
            throw APIError.from("FORBIDDEN", {
              code: "ORGANIZATION_MUTATION_FORBIDDEN",
              message: violation,
            });
          }
        }
      }),
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
        invitationExpiresIn: 60 * 60 * 48,
        sendInvitationEmail,
        organizationHooks: {
          afterCreateInvitation: async ({ invitation, inviter, organization }) => {
            await database.auditLogEntry.create({
              data: {
                organizationId: organization.id,
                actorUserId: inviter.id,
                action: "organization.invitation.created",
                entityType: "Invitation",
                entityId: invitation.id,
                metadata: { email: invitation.email, role: invitation.role },
              },
            });
          },
          afterAcceptInvitation: async ({ invitation, member, user, organization }) => {
            await database.$transaction([
              database.emailDelivery.updateMany({
                where: { invitationId: invitation.id, status: "PENDING" },
                data: { status: "CANCELLED", lastError: "Invitation was accepted before delivery" },
              }),
              database.auditLogEntry.create({
                data: {
                  organizationId: organization.id,
                  actorUserId: user.id,
                  action: "organization.invitation.accepted",
                  entityType: "Member",
                  entityId: member.id,
                  metadata: { invitationId: invitation.id, role: member.role },
                },
              }),
            ]);
          },
          afterCancelInvitation: async ({ invitation, cancelledBy, organization }) => {
            await database.$transaction([
              database.emailDelivery.updateMany({
                where: { invitationId: invitation.id, status: "PENDING" },
                data: {
                  status: "CANCELLED",
                  lastError: "Invitation was cancelled before delivery",
                },
              }),
              database.auditLogEntry.create({
                data: {
                  organizationId: organization.id,
                  actorUserId: cancelledBy.id,
                  action: "organization.invitation.cancelled",
                  entityType: "Invitation",
                  entityId: invitation.id,
                },
              }),
            ]);
          },
          afterUpdateMemberRole: async ({ member, previousRole, user, organization }) => {
            await database.auditLogEntry.create({
              data: {
                organizationId: organization.id,
                action: "organization.member.role_changed",
                entityType: "Member",
                entityId: member.id,
                metadata: { userId: user.id, previousRole, role: member.role },
              },
            });
          },
          afterRemoveMember: async ({ member, user, organization }) => {
            await database.auditLogEntry.create({
              data: {
                organizationId: organization.id,
                action: "organization.member.removed",
                entityType: "Member",
                entityId: member.id,
                metadata: { userId: user.id, role: member.role },
              },
            });
          },
        },
        schema: {
          organization: {
            additionalFields: {
              status: {
                type: [...organizationStatuses],
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
  role: OrganizationRole;
  status: MembershipStatus;
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
        role: true,
        status: true,
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
    return memberships.map(({ organization, role, status }) => ({
      ...organization,
      role: role as OrganizationRole,
      status: status as MembershipStatus,
    }));
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
