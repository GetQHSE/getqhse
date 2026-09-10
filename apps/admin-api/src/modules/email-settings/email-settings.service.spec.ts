import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmailSettingsService } from "./email-settings.service.js";

const administrator = {
  id: "admin-1",
  email: "admin@example.com",
  name: "Admin User",
  status: "active",
  platformRole: "platform_admin",
  activeOrganizationId: null,
} as const;

function harness() {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
  const database = {
    emailSetting: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(({ create }: { create: Record<string, unknown> }) => ({
        ...create,
        createdAt: new Date("2026-09-09T12:00:00Z"),
        updatedAt: new Date("2026-09-09T12:00:00Z"),
        updatedBy: { id: administrator.id, name: administrator.name },
      })),
      update: vi.fn(),
    },
  };
  const service = new EmailSettingsService({ database } as never);
  return { database, service };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("EmailSettingsService", () => {
  it("keeps support users read-only", async () => {
    const { service } = harness();
    await expect(
      service.update(
        { ...administrator, platformRole: "support" },
        { templates: { ORGANIZATION_INVITATION: 42 } },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("validates changed templates and never returns the plaintext key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 42,
            name: "Invitation",
            subject: "Join {{ params.organizationName }}",
            isActive: true,
          }),
        ),
      ),
    );
    const { service } = harness();
    const result = await service.update(administrator, {
      apiKey: "xkeysib-plaintext-secret",
      templates: { ORGANIZATION_INVITATION: 42 },
    });
    expect(result.templates.ORGANIZATION_INVITATION.metadata).toMatchObject({
      name: "Invitation",
      active: true,
    });
    expect(JSON.stringify(result)).not.toContain("xkeysib-plaintext-secret");
    expect(result.credential.preview).toMatch(/••••/);
  });

  it("rejects inactive Brevo templates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 42,
            name: "Inactive",
            subject: "Inactive",
            isActive: false,
          }),
        ),
      ),
    );
    const { service } = harness();
    await expect(
      service.update(administrator, {
        apiKey: "xkeysib-test-key",
        templates: { ORGANIZATION_INVITATION: 42 },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
