import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateProject, PaginationQuery } from "@qhse/contracts";

import type { TenantContext } from "../../../common/request-context.js";
import { ProjectRepository } from "../domain/project.repository.js";

@Injectable()
export class ProjectsService {
  constructor(private readonly repository: ProjectRepository) {}

  async list(tenant: TenantContext, pagination: PaginationQuery) {
    const result = await this.repository.list(tenant.organizationId, pagination);
    return {
      data: result.items,
      meta: { nextCursor: result.nextCursor, hasMore: result.nextCursor !== null },
    };
  }

  create(tenant: TenantContext, input: CreateProject) {
    return this.repository.create(tenant.organizationId, tenant.userId, input);
  }

  async get(tenant: TenantContext, projectId: string) {
    const project = await this.repository.findById(tenant.organizationId, projectId);
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}
