import type { CreateProject, PaginationQuery, Project } from "@qhse/contracts";

export abstract class ProjectRepository {
  abstract list(
    organizationId: string,
    pagination: PaginationQuery,
  ): Promise<{ items: Project[]; nextCursor: string | null }>;
  abstract create(
    organizationId: string,
    actorUserId: string,
    input: CreateProject,
  ): Promise<Project>;
  abstract findById(organizationId: string, projectId: string): Promise<Project | null>;
  abstract countActive(organizationId: string): Promise<number>;
}
