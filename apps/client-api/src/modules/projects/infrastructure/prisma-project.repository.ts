import { Injectable, Optional } from "@nestjs/common";
import type { CreateProject, PaginationQuery, Project } from "@qhse/contracts";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";

import { ProjectRepository } from "../domain/project.repository.js";

function toContract(project: {
  id: string;
  organizationId: string;
  name: string;
  key: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): Project {
  return {
    ...project,
    status: project.status as Project["status"],
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

@Injectable()
export class PrismaProjectRepository extends ProjectRepository {
  private readonly database: DatabaseClient;

  constructor(@Optional() database?: DatabaseClient) {
    super();
    this.database = database ?? createPrismaClient();
  }

  async list(organizationId: string, pagination: PaginationQuery) {
    const records = await this.database.project.findMany({
      where: { organizationId, deletedAt: null },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
    });
    const hasMore = records.length > pagination.limit;
    const items = records.slice(0, pagination.limit);
    return {
      items: items.map(toContract),
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async create(
    organizationId: string,
    actorUserId: string,
    input: CreateProject,
  ): Promise<Project> {
    const record = await this.database.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          organizationId,
          name: input.name,
          key: input.key,
          description: input.description,
        },
      });
      await tx.projectActivity.create({
        data: {
          organizationId,
          projectId: project.id,
          actorUserId,
          action: "project.created",
          metadata: { key: project.key, name: project.name },
        },
      });
      return project;
    });
    return toContract(record);
  }

  async findById(organizationId: string, projectId: string): Promise<Project | null> {
    const record = await this.database.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
    });
    return record ? toContract(record) : null;
  }

  countActive(organizationId: string): Promise<number> {
    return this.database.project.count({
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
    });
  }
}
