import { Module } from "@nestjs/common";

import { AuthService } from "./auth.service.js";
import { PlatformAdminGuard } from "./platform-admin.guard.js";

@Module({
  providers: [AuthService, PlatformAdminGuard],
  exports: [AuthService, PlatformAdminGuard],
})
export class AuthModule {}
