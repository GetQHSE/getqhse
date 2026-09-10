import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { TenantContextGuard } from "../auth/authorization/tenant-context.guard.js";
import {
  InvitationPreviewController,
  OrganizationTeamController,
} from "./organizations.controller.js";
import { OrganizationsService } from "./organizations.service.js";

@Module({
  imports: [AuthModule],
  controllers: [InvitationPreviewController, OrganizationTeamController],
  providers: [OrganizationsService, TenantContextGuard],
})
export class OrganizationsModule {}
