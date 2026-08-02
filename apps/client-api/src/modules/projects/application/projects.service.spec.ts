import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { TenantContext } from "../../../common/request-context.js";
import type { ProjectRepository } from "../domain/project.repository.js";
import { ProjectsService } from "./projects.service.js";

const tenant: TenantContext = { organizationId: "org_1", userId: "user_1", role: "member" };
const project = {
  id: "project_1",
  organizationId: tenant.organizationId,
  name: "Projet QHSE",
  key: "QHSE",
  description: null,
  status: "ACTIVE" as const,
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

function repositoryMock(): ProjectRepository {
  return {
    list: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    countActive: vi.fn(),
  };
}

describe("ProjectsService", () => {
  it("lists tenant-scoped projects with pagination metadata", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.list).mockResolvedValue({ items: [project], nextCursor: "project_1" });
    const service = new ProjectsService(repository);

    await expect(service.list(tenant, { limit: 1 })).resolves.toEqual({
      data: [project],
      meta: { nextCursor: "project_1", hasMore: true },
    });
    expect(repository.list).toHaveBeenCalledWith(tenant.organizationId, { limit: 1 });
  });

  it("creates projects for the current tenant and actor", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.create).mockResolvedValue(project);
    const service = new ProjectsService(repository);

    await expect(
      service.create(tenant, { name: project.name, key: project.key, description: null }),
    ).resolves.toEqual(project);
    expect(repository.create).toHaveBeenCalledWith(tenant.organizationId, tenant.userId, {
      name: project.name,
      key: project.key,
      description: null,
    });
  });

  it("rejects access to projects outside the tenant scope", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.findById).mockResolvedValue(null);
    const service = new ProjectsService(repository);

    await expect(service.get(tenant, "other_project")).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.findById).toHaveBeenCalledWith(tenant.organizationId, "other_project");
  });
});
