import { describe, expect, it } from "vitest";

import { canAccessAdmin } from "./auth.js";

describe("admin access", () => {
  it.each(["super_admin", "platform_admin", "support", "content_manager"])(
    "allows the %s platform role",
    (role) => {
      expect(canAccessAdmin(role)).toBe(true);
    },
  );

  it.each(["user", "owner", "admin", "member", null])("rejects %s", (role) => {
    expect(canAccessAdmin(role)).toBe(false);
  });
});
