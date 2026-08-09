import { Injectable, Optional } from "@nestjs/common";
import type { CreateProject, PaginationQuery, Project } from "@qhse/contracts";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";

import { ProjectRepository } from "../domain/project.repository.js";

function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

function normalizeActivity(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function toContract(project: {
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  entityType: string;
  countryCode: string;
  standardCode: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  activities: Array<{ id: string; name: string; isPrimary: boolean }>;
}): Project {
  return {
    ...project,
    entityType: project.entityType as Project["entityType"],
    countryCode: project.countryCode as Project["countryCode"],
    standardCode: "ISO_9001",
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
      where: { organizationId, archivedAt: null },
      include: { activities: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
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
    const uniqueActivities = new Map<
      string,
      { name: string; normalizedName: string; isPrimary: boolean }
    >();
    for (const activity of input.activities) {
      const name = activity.name.trim().replace(/\s+/g, " ");
      const normalizedName = normalizeActivity(name);
      if (!uniqueActivities.has(normalizedName)) {
        uniqueActivities.set(normalizedName, {
          name,
          normalizedName,
          isPrimary: activity.isPrimary === true,
        });
      }
    }
    const activities = [...uniqueActivities.values()];
    if (!activities.some((activity) => activity.isPrimary)) activities[0]!.isPrimary = true;
    let primarySeen = false;
    for (const activity of activities) {
      if (activity.isPrimary && primarySeen) activity.isPrimary = false;
      if (activity.isPrimary) primarySeen = true;
    }

    const baseSlug = slugify(input.name);
    const record = await this.database.$transaction(async (tx) => {
      let slug = baseSlug;
      let suffix = 1;
      while (
        await tx.project.findUnique({ where: { organizationId_slug: { organizationId, slug } } })
      ) {
        suffix += 1;
        slug = `${baseSlug}-${suffix}`;
      }
      return tx.project.create({
        data: {
          organizationId,
          createdById: actorUserId,
          name: input.name.trim(),
          slug,
          logoUrl: input.logoUrl ?? null,
          entityType: input.entityType,
          countryCode: input.countryCode,
          standardCode: "ISO_9001",
          description: input.description?.trim() || null,
          status: "EMPTY",
          activities: { create: activities },
          profile: { create: {} },
        },
        include: { activities: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
      });
    });
    return toContract(record);
  }

  async findById(organizationId: string, projectIdOrSlug: string): Promise<Project | null> {
    const record = await this.database.project.findFirst({
      where: {
        organizationId,
        archivedAt: null,
        OR: [{ id: projectIdOrSlug }, { slug: projectIdOrSlug }],
      },
      include: { activities: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
    });
    return record ? toContract(record) : null;
  }

  countActive(organizationId: string): Promise<number> {
    return this.database.project.count({ where: { organizationId, archivedAt: null } });
  }
}
