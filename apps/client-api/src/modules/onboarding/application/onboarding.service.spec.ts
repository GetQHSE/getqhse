import { describe, expect, it, vi } from "vitest";

import type { AuthenticationPort } from "../../auth/application/auth.port.js";
import { OnboardingService } from "./onboarding.service.js";

function harness(projectCount: number) {
  const authentication = {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "user_1", activeOrganizationId: "org_1" }),
    listActiveOrganizations: vi
      .fn()
      .mockResolvedValue([{ id: "org_1", name: "Acme", slug: "acme" }]),
  } as unknown as AuthenticationPort;
  const database = {
    member: {
      findFirst: vi.fn().mockResolvedValue({
        organization: {
          id: "org_1",
          name: "Acme",
          slug: "acme",
          icon: "building",
          countryCode: "MA",
        },
      }),
    },
    project: { count: vi.fn().mockResolvedValue(projectCount) },
  };
  return {
    service: new OnboardingService(authentication, database as never),
    database,
    authentication,
  };
}

describe("OnboardingService", () => {
  it("returns sign in without a session", async () => {
    const { service, authentication } = harness(0);
    vi.mocked(authentication.getCurrentUser).mockResolvedValue(null);
    await expect(service.getStatus({})).resolves.toMatchObject({
      authenticated: false,
      nextStep: "SIGN_IN",
    });
  });

  it("returns create project when the active organization is empty", async () => {
    const { service, database } = harness(0);
    await expect(service.getStatus({})).resolves.toMatchObject({
      authenticated: true,
      activeOrganizationProjectCount: 0,
      nextStep: "CREATE_PROJECT",
    });
    expect(database.project.count).toHaveBeenCalledWith({
      where: { organizationId: "org_1", archivedAt: null },
    });
  });

  it("opens projects when the active organization has projects", async () => {
    const { service } = harness(2);
    await expect(service.getStatus({})).resolves.toMatchObject({
      activeOrganizationProjectCount: 2,
      nextStep: "OPEN_PROJECTS",
    });
  });
});
