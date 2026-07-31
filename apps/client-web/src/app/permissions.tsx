import { createContext, type PropsWithChildren, useContext } from "react";

export type Permission =
  | "site:read"
  | "site:write"
  | "audit:read"
  | "audit:write"
  | "evidence:write"
  | "finding:write"
  | "action:write"
  | "report:export";

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
