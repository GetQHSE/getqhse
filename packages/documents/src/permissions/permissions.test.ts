import { describe, expect, it } from "vitest";
import { canManageDocuments } from "./index.js";

describe("document permissions", () => {
  it("limits support users to metadata and status visibility", () => {
    expect(canManageDocuments("support", "view")).toBe(true);
    expect(canManageDocuments("support", "publish")).toBe(false);
    expect(canManageDocuments("support", "archive")).toBe(false);
    expect(canManageDocuments("support", "delete")).toBe(false);
  });

  it("reserves duplicate overrides for super administrators", () => {
    expect(canManageDocuments("super_admin", "override_duplicate")).toBe(true);
    expect(canManageDocuments("platform_admin", "override_duplicate")).toBe(false);
    expect(canManageDocuments("content_manager", "override_duplicate")).toBe(false);
  });
});
