import { createContext, type PropsWithChildren, useContext } from "react";

export type Permission =
  | "organization:manage"
  | "site:read"
  | "site:write"
  | "audit:read"
  | "audit:write"
  | "evidence:write"
  | "finding:write"
  | "action:write"
  | "report:export"
  | "regulatory:read"
  | "regulatory:contribute"
  | "regulatory:approve";

const rolePermissions: Record<string, Permission[]> = {
  owner: [
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
  ],
  admin: [
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
  ],
  member: [
    "site:read",
    "audit:read",
    "evidence:write",
    "action:write",
    "regulatory:read",
    "regulatory:contribute",
  ],
};

const PermissionContext = createContext<ReadonlySet<Permission>>(new Set());

export function PermissionProvider({
  children,
  permissions = new Set<Permission>(),
}: PropsWithChildren<{ permissions?: ReadonlySet<Permission> }>) {
  return <PermissionContext.Provider value={permissions}>{children}</PermissionContext.Provider>;
}

export function usePermissions() {
  return useContext(PermissionContext);
}

export function permissionsForRole(role: string | undefined): ReadonlySet<Permission> {
  return new Set(role ? (rolePermissions[role] ?? []) : []);
}
