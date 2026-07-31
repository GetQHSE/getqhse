import type { Request } from "express";

export type AuthenticatedUser = {
  id: string;
  email: string;
};

export type TenantContext = {
  organizationId: string;
  userId: string;
  role: string;
};

export type QhseRequest = Request & {
  id: string;
  authenticatedUser?: AuthenticatedUser;
  tenant?: TenantContext;
};
