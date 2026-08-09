import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateSite, PaginationQuery } from "@qhse/contracts";

import type { TenantContext } from "../../../common/request-context.js";
import { SiteRepository } from "../domain/site.repository.js";

@Injectable()
export class SitesService {
  constructor(@Inject(SiteRepository) private readonly repository: SiteRepository) {}

  async list(tenant: TenantContext, pagination: PaginationQuery) {
    const result = await this.repository.list(tenant.organizationId, pagination);
    return {
      data: result.items,
      meta: { nextCursor: result.nextCursor, hasMore: result.nextCursor !== null },
    };
  }

  create(tenant: TenantContext, input: CreateSite) {
    return this.repository.create(tenant.organizationId, input);
  }

  async get(tenant: TenantContext, siteId: string) {
    const site = await this.repository.findById(tenant.organizationId, siteId);
    if (!site) throw new NotFoundException("Site not found");
    return site;
  }
}
