import type { CreateSite, PaginationQuery, Site } from "@qhse/contracts";

export abstract class SiteRepository {
  abstract list(
    organizationId: string,
    pagination: PaginationQuery,
  ): Promise<{ items: Site[]; nextCursor: string | null }>;
  abstract create(organizationId: string, input: CreateSite): Promise<Site>;
  abstract findById(organizationId: string, siteId: string): Promise<Site | null>;
  abstract updateName(organizationId: string, siteId: string, name: string): Promise<Site | null>;
  abstract delete(organizationId: string, siteId: string): Promise<boolean>;
}
