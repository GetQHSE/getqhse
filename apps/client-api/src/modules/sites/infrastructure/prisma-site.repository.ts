import { Injectable, Optional } from "@nestjs/common";
import type { CreateSite, PaginationQuery, Site } from "@qhse/contracts";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";

import { SiteRepository } from "../domain/site.repository.js";

function toContract(site: {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Site {
  return {
    ...site,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  };
}

@Injectable()
export class PrismaSiteRepository extends SiteRepository {
  private readonly database: DatabaseClient;

  constructor(@Optional() database?: DatabaseClient) {
    super();
    this.database = database ?? createPrismaClient();
  }

  async list(organizationId: string, pagination: PaginationQuery) {
    const records = await this.database.site.findMany({
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

  async create(organizationId: string, input: CreateSite): Promise<Site> {
    const record = await this.database.site.create({
      data: { organizationId, name: input.name, code: input.code, address: input.address },
    });
    return toContract(record);
  }

  async findById(organizationId: string, siteId: string): Promise<Site | null> {
    const record = await this.database.site.findFirst({
      where: { id: siteId, organizationId, deletedAt: null },
    });
    return record ? toContract(record) : null;
  }

  async updateName(organizationId: string, siteId: string, name: string): Promise<Site | null> {
    const result = await this.database.site.updateMany({
      where: { id: siteId, organizationId, deletedAt: null },
      data: { name },
    });
    return result.count === 1 ? this.findById(organizationId, siteId) : null;
  }

  async delete(organizationId: string, siteId: string): Promise<boolean> {
    const result = await this.database.site.updateMany({
      where: { id: siteId, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count === 1;
  }
}
