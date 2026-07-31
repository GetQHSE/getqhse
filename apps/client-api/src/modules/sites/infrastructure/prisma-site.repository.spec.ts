import type { DatabaseClient } from "@qhse/database";
import { describe, expect, it, vi } from "vitest";

import { PrismaSiteRepository } from "./prisma-site.repository.js";

const siteRecord = {
  id: "site-1",
  organizationId: "org-1",
  name: "Casablanca Plant",
  code: "CAS-01",
  address: null,
  tags: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  deletedAt: null,
};

describe("PrismaSiteRepository tenant predicates", () => {
  it("scopes list queries to the session organization", async () => {
    const findMany = vi.fn().mockResolvedValue([siteRecord]);
    const database = { site: { findMany } } as unknown as DatabaseClient;

    await new PrismaSiteRepository(database).list("org-1", { limit: 25 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", deletedAt: null } }),
    );
  });

  it("scopes mutations to both resource and organization IDs", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const database = { site: { updateMany } } as unknown as DatabaseClient;

    const result = await new PrismaSiteRepository(database).delete("org-2", "site-1");

    expect(result).toBe(false);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "site-1", organizationId: "org-2", deletedAt: null },
      }),
    );
  });
});
