import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { CreateProject, Project } from "@qhse/contracts";
import { describe, expect, it, vi } from "vitest";

import type { TenantContext } from "../../../common/request-context.js";
import type { ProjectRepository } from "../domain/project.repository.js";
import { ProjectsService } from "./projects.service.js";

const tenant: TenantContext = { organizationId: "org_1", userId: "user_1", role: "owner" };
const project: Project = {
  id: "project_1",
  organizationId: tenant.organizationId,
  createdById: tenant.userId,
  name: "Projet QHSE",
  slug: "projet-qhse",
  logoUrl: null,
  entityType: "COMPANY",
  countryCode: "MA",
  standardCode: "ISO_9001",
  description: null,
  status: "EMPTY",
  activities: [{ id: "activity_1", name: "Manufacturing", isPrimary: true }],
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};
const input: CreateProject = {
  name: project.name,
  entityType: "COMPANY",
  countryCode: "MA",
  activities: [{ name: "Manufacturing" }],
  description: null,
};

function repositoryMock(): ProjectRepository {
  return { list: vi.fn(), create: vi.fn(), findById: vi.fn(), countActive: vi.fn() };
}

describe("ProjectsService", () => {
  it("lists tenant-scoped projects with pagination metadata", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.list).mockResolvedValue({ items: [project], nextCursor: "project_1" });
    await expect(new ProjectsService(repository).list(tenant, { limit: 1 })).resolves.toEqual({
      data: [project],
      meta: { nextCursor: "project_1", hasMore: true },
    });
  });

  it("creates projects for the current tenant and actor", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.create).mockResolvedValue(project);
    await expect(new ProjectsService(repository).create(tenant, input)).resolves.toEqual(project);
    expect(vi.mocked(repository.create)).toHaveBeenCalledWith(
      tenant.organizationId,
      tenant.userId,
      input,
    );
  });

  it("prevents members from creating projects", () => {
    const repository = repositoryMock();
    expect(() =>
      new ProjectsService(repository).create({ ...tenant, role: "member" }, input),
    ).toThrow(ForbiddenException);
  });

  it("rejects access to projects outside the tenant scope", async () => {
    const repository = repositoryMock();
    vi.mocked(repository.findById).mockResolvedValue(null);
    await expect(
      new ProjectsService(repository).get(tenant, "other_project"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
