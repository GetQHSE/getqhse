import { describe, expect, it, vi } from "vitest";

import type { TenantContext } from "../../../common/request-context.js";
import { OnboardingService } from "./onboarding.service.js";

const tenant: TenantContext = { organizationId: "org_1", userId: "user_1", role: "member" };

function databaseMock(projectCount: number) {
  return {
    organization: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: tenant.organizationId,
        name: "Acme QHSE",
        slug: "acme-qhse",
        icon: "shield",
      }),
    },
    project: {
      count: vi.fn().mockResolvedValue(projectCount),
    },
  };
}

describe("OnboardingService", () => {
  it("returns create project as the next step when no project exists", async () => {
    const database = databaseMock(0);
    const service = new OnboardingService(database as never);

    await expect(service.getStatus(tenant)).resolves.toMatchObject({
      organization: { id: tenant.organizationId, icon: "shield" },
      projects: { count: 0, hasProjects: false },
      nextStep: "CREATE_PROJECT",
      isComplete: false,
    });
    expect(database.project.count).toHaveBeenCalledWith({
      where: { organizationId: tenant.organizationId, deletedAt: null, status: "ACTIVE" },
    });
  });

  it("marks onboarding complete when active projects exist", async () => {
    const database = databaseMock(2);
    const service = new OnboardingService(database as never);

    await expect(service.getStatus(tenant)).resolves.toMatchObject({
      projects: { count: 2, hasProjects: true },
      nextStep: "COMPLETE",
      isComplete: true,
    });
  });
});
