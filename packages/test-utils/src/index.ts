import type { Organization, Site } from "@qhse/contracts";

const now = "2026-01-01T00:00:00.000Z";

export const organizations = {
  atlas: {
    id: "org_atlas",
    name: "Atlas Manufacturing",
    slug: "atlas-manufacturing",
    createdAt: now,
    updatedAt: now,
  },
  rif: {
    id: "org_rif",
    name: "Rif Logistics",
    slug: "rif-logistics",
    createdAt: now,
    updatedAt: now,
  },
} satisfies Record<string, Organization>;

export function siteFactory(overrides: Partial<Site> = {}): Site {
  return {
    id: "site_casa",
    organizationId: organizations.atlas.id,
    name: "Casablanca Plant",
    code: "CAS-01",
    address: "Casablanca",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function authenticatedHeaders(organizationId = organizations.atlas.id) {
  return {
    cookie: "better-auth.session_token=test-session",
    "x-test-organization-id": organizationId,
  };
}
