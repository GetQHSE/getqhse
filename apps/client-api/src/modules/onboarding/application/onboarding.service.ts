import { Injectable, Optional } from "@nestjs/common";
import type { OnboardingStatus } from "@qhse/contracts";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";

import type { TenantContext } from "../../../common/request-context.js";

@Injectable()
export class OnboardingService {
  private readonly database: DatabaseClient;

  constructor(@Optional() database?: DatabaseClient) {
    this.database = database ?? createPrismaClient();
  }

  async getStatus(tenant: TenantContext): Promise<OnboardingStatus> {
    const [organization, projectCount] = await Promise.all([
      this.database.organization.findUniqueOrThrow({
        where: { id: tenant.organizationId },
        select: { id: true, name: true, slug: true, icon: true },
      }),
      this.database.project.count({
        where: { organizationId: tenant.organizationId, deletedAt: null, status: "ACTIVE" },
      }),
    ]);
    const hasProjects = projectCount > 0;
    return {
      organization,
      projects: { count: projectCount, hasProjects },
      nextStep: hasProjects ? "COMPLETE" : "CREATE_PROJECT",
      isComplete: hasProjects,
    };
  }
}
