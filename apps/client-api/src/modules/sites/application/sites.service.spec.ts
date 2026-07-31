import { describe, expect, it, vi } from "vitest";

import { SitesService } from "./sites.service.js";
import type { SiteRepository } from "../domain/site.repository.js";

describe("SitesService tenant scoping", () => {
  it("always supplies the authenticated tenant to the repository", async () => {
    const list = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const repository = {
      list,
    } as unknown as SiteRepository;
    const service = new SitesService(repository);

    await service.list(
      { organizationId: "org-session", userId: "user-1", role: "member" },
      { limit: 25 },
    );

    expect(list).toHaveBeenCalledWith("org-session", { limit: 25 });
  });
});
