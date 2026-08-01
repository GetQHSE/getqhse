import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ServerAuthError } from "@qhse/auth";
import { describe, expect, it, vi } from "vitest";

import { AuthService } from "./auth.service.js";
import { PlatformAdminGuard } from "./platform-admin.guard.js";

function context(request = { headers: {} }) {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe("PlatformAdminGuard", () => {
  it("resolves its dependencies through the Nest container", async () => {
    const auth = { requirePlatformAdmin: vi.fn().mockResolvedValue({ id: "user-1" }) };
    const module = await Test.createTestingModule({
      providers: [
        Reflector,
        PlatformAdminGuard,
        { provide: AuthService, useValue: auth },
      ],
    }).compile();
    const guard = module.get(PlatformAdminGuard);

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(auth.requirePlatformAdmin).toHaveBeenCalledWith({});
  });

  it("returns 401 for requests without a session", async () => {
    const auth = {
      requirePlatformAdmin: vi
        .fn()
        .mockRejectedValue(new ServerAuthError(401, "Authentication required")),
    };
    const guard = new PlatformAdminGuard(new Reflector(), auth as never);
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("returns 403 for authenticated normal users", async () => {
    const auth = {
      requirePlatformAdmin: vi
        .fn()
        .mockRejectedValue(new ServerAuthError(403, "Platform administrator role is required")),
    };
    const guard = new PlatformAdminGuard(new Reflector(), auth as never);
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("attaches an allowed platform administrator", async () => {
    const request = { headers: {}, platformUser: undefined };
    const support = { id: "user-1", platformRole: "support" };
    const auth = { requirePlatformAdmin: vi.fn().mockResolvedValue(support) };
    const guard = new PlatformAdminGuard(new Reflector(), auth as never);
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.platformUser).toBe(support);
  });
});
