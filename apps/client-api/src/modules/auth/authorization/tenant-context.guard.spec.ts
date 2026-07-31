import { describe, expect, it, vi } from "vitest";

import type { QhseRequest } from "../../../common/request-context.js";
import type { AuthenticationPort } from "../application/auth.port.js";
import { TenantContextGuard } from "./tenant-context.guard.js";

describe("TenantContextGuard", () => {
  it("accepts a client organization selection only after verifying membership", async () => {
    const requireOrganization = vi.fn().mockResolvedValue({
      organizationId: "org-verified",
      userId: "user-1",
      role: "member",
    });
    const authentication = {
      requireAuth: vi.fn().mockResolvedValue({
        id: "user-1",
        email: "user@example.invalid",
      }),
      requireOrganization,
    } as unknown as AuthenticationPort;
    const request = {
      headers: {},
      header: vi.fn().mockReturnValue("org-verified"),
    } as unknown as QhseRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    await expect(new TenantContextGuard(authentication).canActivate(context)).resolves.toBe(true);
    expect(requireOrganization).toHaveBeenCalledWith({}, "org-verified");
    expect(request.tenant?.organizationId).toBe("org-verified");
  });
});
