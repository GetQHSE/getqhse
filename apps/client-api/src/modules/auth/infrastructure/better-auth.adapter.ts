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
import { createEmailDelivery, organizationInvitationParameters } from "@qhse/notifications";
import { toNodeHandler } from "better-auth/node";

import { parseCorsOrigins } from "../../../common/cors.js";
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
      trustedOrigins: parseCorsOrigins(),
      secureCookies: process.env["COOKIE_SECURE"] === "true",
      sendInvitationEmail: async (data) => {
        const priorDeliveryCount = await this.database.emailDelivery.count({
          where: { invitationId: data.id, type: "ORGANIZATION_INVITATION" },
        });
        const recipient = await this.database.user.findUnique({
          where: { email: data.email.toLowerCase() },
          select: { id: true, name: true },
        });
        const appOrigin = (process.env["APP_ORIGIN"] ?? "http://localhost:5173").replace(
          /\/+$/,
          "",
        );
        const delivery = await createEmailDelivery(this.database, {
          organizationId: data.organization.id,
          invitationId: data.id,
          ...(recipient ? { recipientUserId: recipient.id, recipientName: recipient.name } : {}),
          type: "ORGANIZATION_INVITATION",
          eventKey: `${data.id}:${data.invitation.expiresAt.toISOString()}`,
          recipientEmail: data.email,
          entityType: "Invitation",
          entityId: data.id,
          parameters: organizationInvitationParameters({
            recipientEmail: data.email,
            inviterName: data.inviter.user.name,
            inviterEmail: data.inviter.user.email,
            organizationName: data.organization.name,
            role: data.role,
            appOrigin,
            invitationId: data.id,
            expiresAt: data.invitation.expiresAt,
          }),
        });
        if (delivery) {
          await this.database.auditLogEntry.createMany({
            data: [
              {
                organizationId: data.organization.id,
                actorUserId: data.inviter.user.id,
                action: "organization.invitation.email_queued",
                entityType: "EmailDelivery",
                entityId: delivery.id,
                metadata: { invitationId: data.id },
              },
              ...(priorDeliveryCount > 0
                ? [
                    {
                      organizationId: data.organization.id,
                      actorUserId: data.inviter.user.id,
                      action: "organization.invitation.resent",
                      entityType: "Invitation",
                      entityId: data.id,
                      metadata: {
                        deliveryId: delivery.id,
                        expiresAt: data.invitation.expiresAt.toISOString(),
                      },
                    },
                  ]
                : []),
            ],
          });
        }
      },
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
