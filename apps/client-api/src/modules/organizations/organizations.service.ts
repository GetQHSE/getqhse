import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  InvitationPreview,
  OrganizationMemberSummary,
  OrganizationTeam,
  UpdateMembershipStatus,
} from "@qhse/contracts";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";
import { maskEmailAddress } from "@qhse/notifications";

import type { TenantContext } from "../../common/request-context.js";

@Injectable()
export class OrganizationsService {
  private readonly database: DatabaseClient = createPrismaClient();

  async invitationPreview(invitationId: string): Promise<InvitationPreview> {
    const invitation = await this.database.invitation.findUnique({
      where: { id: invitationId },
      include: {
        organization: { select: { name: true } },
        inviter: { select: { name: true } },
      },
    });
    if (!invitation) throw new NotFoundException("Invitation not found");
    const status =
      invitation.status === "pending" && invitation.expiresAt.getTime() <= Date.now()
        ? "expired"
        : invitation.status;
    if (!["pending", "accepted", "rejected", "canceled", "expired"].includes(status)) {
      throw new NotFoundException("Invitation not found");
    }
    return {
      id: invitation.id,
      organizationName: invitation.organization.name,
      inviterName: invitation.inviter.name,
      recipientEmailMasked: maskEmailAddress(invitation.email),
      role: invitation.role as InvitationPreview["role"],
      status: status as InvitationPreview["status"],
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async team(tenant: TenantContext): Promise<OrganizationTeam> {
    const [members, invitations] = await Promise.all([
      this.database.member.findMany({
        where: { organizationId: tenant.organizationId },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      }),
      this.database.invitation.findMany({
        where: { organizationId: tenant.organizationId, status: "pending" },
        include: {
          emailDeliveries: {
            select: { status: true, lastError: true, sentAt: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const summaries = members.map((member): OrganizationMemberSummary => ({
      id: member.id,
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      role: member.role as OrganizationMemberSummary["role"],
      status: member.status as OrganizationMemberSummary["status"],
      createdAt: member.createdAt.toISOString(),
    }));
    const currentMember = summaries.find((member) => member.userId === tenant.userId);
    if (!currentMember) throw new ForbiddenException("No active organization membership");
    return {
      currentMember,
      members: summaries,
      invitations: invitations.map((invitation) => {
        const delivery = invitation.emailDeliveries[0];
        return {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role as OrganizationMemberSummary["role"],
          status: invitation.expiresAt.getTime() <= Date.now() ? "expired" : invitation.status,
          expiresAt: invitation.expiresAt.toISOString(),
          createdAt: invitation.createdAt.toISOString(),
          deliveryStatus: delivery?.status ?? null,
          deliveryError: delivery?.lastError ?? null,
          lastSentAt: delivery?.sentAt?.toISOString() ?? null,
        };
      }),
    };
  }

  async updateMembershipStatus(
    tenant: TenantContext,
    requestId: string,
    memberId: string,
    input: UpdateMembershipStatus,
  ) {
    if (tenant.role !== "owner" && tenant.role !== "admin") {
      throw new ForbiddenException("Organization management is required");
    }
    const target = await this.database.member.findFirst({
      where: { id: memberId, organizationId: tenant.organizationId },
    });
    if (!target) throw new NotFoundException("Organization member not found");
    if (target.userId === tenant.userId)
      throw new ForbiddenException("You cannot suspend yourself");
    if (tenant.role === "admin" && target.role === "owner") {
      throw new ForbiddenException("Administrators cannot manage owners");
    }
    if (target.role === "owner" && input.status === "suspended") {
      const activeOwners = await this.database.member.count({
        where: { organizationId: tenant.organizationId, role: "owner", status: "active" },
      });
      if (activeOwners <= 1)
        throw new ForbiddenException("The final active owner cannot be suspended");
    }
    if (target.status === input.status) return this.team(tenant);
    await this.database.$transaction([
      this.database.member.update({ where: { id: target.id }, data: { status: input.status } }),
      this.database.auditLogEntry.create({
        data: {
          organizationId: tenant.organizationId,
          actorUserId: tenant.userId,
          action:
            input.status === "suspended"
              ? "organization.member.suspended"
              : "organization.member.reactivated",
          entityType: "Member",
          entityId: target.id,
          requestId,
          metadata: { userId: target.userId, previousStatus: target.status, status: input.status },
        },
      }),
      ...(input.status === "suspended"
        ? [
            this.database.session.updateMany({
              where: { userId: target.userId, activeOrganizationId: tenant.organizationId },
              data: { activeOrganizationId: null },
            }),
          ]
        : []),
    ]);
    return this.team(tenant);
  }
}
