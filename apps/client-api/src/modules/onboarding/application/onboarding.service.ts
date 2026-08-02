import type { IncomingHttpHeaders } from "node:http";

import { Injectable, Optional } from "@nestjs/common";
import type { OnboardingStatus } from "@qhse/contracts";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";

import { AuthenticationPort } from "../../auth/application/auth.port.js";

@Injectable()
export class OnboardingService {
  private readonly database: DatabaseClient;

  constructor(
    private readonly authentication: AuthenticationPort,
    @Optional() database?: DatabaseClient,
  ) {
    this.database = database ?? createPrismaClient();
  }

  async getStatus(headers: IncomingHttpHeaders): Promise<OnboardingStatus> {
    const user = await this.authentication.getCurrentUser(headers);
    if (!user) {
      return {
        authenticated: false,
        organizationsCount: 0,
        activeOrganization: null,
        activeOrganizationProjectCount: 0,
        nextStep: "SIGN_IN",
      };
    }

    const organizations = await this.authentication.listActiveOrganizations(headers);
    if (organizations.length === 0) {
      return {
        authenticated: true,
        organizationsCount: 0,
        activeOrganization: null,
        activeOrganizationProjectCount: 0,
        nextStep: "CREATE_ORGANIZATION",
      };
    }

    if (!user.activeOrganizationId) {
      return {
        authenticated: true,
        organizationsCount: organizations.length,
        activeOrganization: null,
        activeOrganizationProjectCount: 0,
        nextStep: organizations.length === 1 ? "CREATE_PROJECT" : "SELECT_ORGANIZATION",
      };
    }

    const membership = await this.database.member.findFirst({
      where: {
        userId: user.id,
        organizationId: user.activeOrganizationId,
        status: "active",
        organization: { status: "active" },
      },
      select: {
        organization: {
          select: { id: true, name: true, slug: true, icon: true, countryCode: true },
        },
      },
    });
    if (!membership) {
      return {
        authenticated: true,
        organizationsCount: organizations.length,
        activeOrganization: null,
        activeOrganizationProjectCount: 0,
        nextStep: "SELECT_ORGANIZATION",
      };
    }

    const projectCount = await this.database.project.count({
      where: { organizationId: membership.organization.id, archivedAt: null },
    });
    return {
      authenticated: true,
      organizationsCount: organizations.length,
      activeOrganization: {
        ...membership.organization,
        countryCode: membership.organization.countryCode as "MA" | "FR" | "DZ" | "TN" | "SN" | "CI",
      },
      activeOrganizationProjectCount: projectCount,
      nextStep: projectCount === 0 ? "CREATE_PROJECT" : "OPEN_PROJECTS",
    };
  }
}
