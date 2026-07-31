import "reflect-metadata";

import { Controller, Get, type INestApplication, UseGuards } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ServerAuthError } from "@qhse/auth";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthenticationPort } from "../../apps/client-api/src/modules/auth/application/auth.port.js";
import { TenantContextGuard } from "../../apps/client-api/src/modules/auth/authorization/tenant-context.guard.js";
import { AuthService } from "../../apps/admin-api/src/modules/auth/auth.service.js";
import { PlatformAdminGuard } from "../../apps/admin-api/src/modules/auth/platform-admin.guard.js";

@Controller("admin-protected")
class AdminProtectedController {
  @Get()
  get() {
    return { allowed: true };
  }
}

@Controller("tenant-protected")
@UseGuards(TenantContextGuard)
class TenantProtectedController {
  @Get()
  get() {
    return { allowed: true };
  }
}

describe("authentication API boundaries", () => {
  let apps: INestApplication[] = [];

  afterEach(async () => {
    await Promise.all(apps.map((app) => app.close()));
    apps = [];
  });

  describe("admin API", () => {
    let app: INestApplication;
    const requirePlatformAdmin = vi.fn();

    beforeEach(async () => {
      requirePlatformAdmin.mockReset();
      const module = await Test.createTestingModule({
        controllers: [AdminProtectedController],
        providers: [
          { provide: AuthService, useValue: { requirePlatformAdmin } },
          { provide: APP_GUARD, useClass: PlatformAdminGuard },
        ],
      }).compile();
      app = module.createNestApplication();
      await app.init();
      apps.push(app);
    });

    it("returns 401 without a Better Auth session", async () => {
      requirePlatformAdmin.mockRejectedValue(new ServerAuthError(401, "Authentication required"));
      await request(app.getHttpServer()).get("/admin-protected").expect(401);
    });

    it("returns 403 for an authenticated normal user", async () => {
      requirePlatformAdmin.mockRejectedValue(
        new ServerAuthError(403, "Platform administrator role is required"),
      );
      await request(app.getHttpServer()).get("/admin-protected").expect(403);
    });

    it("allows an authenticated platform administrator", async () => {
      requirePlatformAdmin.mockResolvedValue({
        id: "user-1",
        platformRole: "support",
      });
      await request(app.getHttpServer())
        .get("/admin-protected")
        .expect(200)
        .expect({ allowed: true });
    });
  });

  describe("client API", () => {
    let app: INestApplication;
    const authentication = {
      requireAuth: vi.fn(),
      requireOrganization: vi.fn(),
    };

    beforeEach(async () => {
      authentication.requireAuth.mockReset();
      authentication.requireOrganization.mockReset();
      const module = await Test.createTestingModule({
        controllers: [TenantProtectedController],
        providers: [TenantContextGuard, { provide: AuthenticationPort, useValue: authentication }],
      }).compile();
      app = module.createNestApplication();
      await app.init();
      apps.push(app);
    });

    it("returns 401 without a Better Auth session", async () => {
      authentication.requireAuth.mockRejectedValue(
        new ServerAuthError(401, "Authentication required"),
      );
      await request(app.getHttpServer()).get("/tenant-protected").expect(401);
    });

    it("returns 403 for an inactive or foreign organization membership", async () => {
      authentication.requireAuth.mockResolvedValue({
        id: "user-1",
        email: "member@example.test",
      });
      authentication.requireOrganization.mockRejectedValue(
        new ServerAuthError(403, "No active organization membership"),
      );
      await request(app.getHttpServer())
        .get("/tenant-protected")
        .set("x-organization-id", "org-foreign")
        .expect(403);
    });

    it("allows an active member and forwards the selected organization", async () => {
      authentication.requireAuth.mockResolvedValue({
        id: "user-1",
        email: "member@example.test",
      });
      authentication.requireOrganization.mockResolvedValue({
        organizationId: "org-1",
        userId: "user-1",
        role: "member",
      });
      await request(app.getHttpServer())
        .get("/tenant-protected")
        .set("x-organization-id", "org-1")
        .expect(200)
        .expect({ allowed: true });
      expect(authentication.requireOrganization).toHaveBeenCalledWith(expect.anything(), "org-1");
    });
  });
});
