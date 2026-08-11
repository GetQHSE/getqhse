export const permissions = [
  "organization:manage",
  "site:read",
  "site:write",
  "audit:read",
  "audit:write",
  "evidence:write",
  "finding:write",
  "action:write",
  "report:export",
  "regulatory:read",
  "regulatory:contribute",
  "regulatory:approve",
] as const;

export type Permission = (typeof permissions)[number];

export const rolePermissions: Readonly<Record<string, ReadonlySet<Permission>>> = {
  owner: new Set(permissions),
  admin: new Set(permissions),
  member: new Set([
    "site:read",
    "audit:read",
    "evidence:write",
    "action:write",
    "regulatory:read",
    "regulatory:contribute",
  ]),
};
