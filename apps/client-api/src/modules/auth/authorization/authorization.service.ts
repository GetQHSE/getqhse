import { Injectable } from "@nestjs/common";

import type { TenantContext } from "../../../common/request-context.js";
import { rolePermissions, type Permission } from "./permission.js";

@Injectable()
export class AuthorizationService {
  can(context: TenantContext, permission: Permission): boolean {
    return rolePermissions[context.role]?.has(permission) ?? false;
  }
}
