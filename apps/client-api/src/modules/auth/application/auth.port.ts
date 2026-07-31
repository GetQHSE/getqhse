import type { IncomingHttpHeaders } from "node:http";

import type {
  ActiveOrganization,
  CurrentUser,
  OrganizationAccess,
  OrganizationRole,
  PlatformRole,
} from "@qhse/auth";

export abstract class AuthenticationPort {
  abstract getCurrentUser(headers: IncomingHttpHeaders): Promise<CurrentUser | null>;
  abstract requireAuth(headers: IncomingHttpHeaders): Promise<CurrentUser>;
  abstract requireOrganization(
    headers: IncomingHttpHeaders,
    requestedOrganizationId?: string,
  ): Promise<OrganizationAccess>;
  abstract listActiveOrganizations(headers: IncomingHttpHeaders): Promise<ActiveOrganization[]>;
  abstract requireOrganizationRole(
    headers: IncomingHttpHeaders,
    roles: readonly OrganizationRole[],
    requestedOrganizationId?: string,
  ): Promise<OrganizationAccess>;
  abstract requirePlatformAdmin(
    headers: IncomingHttpHeaders,
    roles?: readonly PlatformRole[],
  ): Promise<CurrentUser>;
}
