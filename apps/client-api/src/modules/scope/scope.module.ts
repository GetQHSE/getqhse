import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { TenantContextGuard } from "../auth/authorization/tenant-context.guard.js";
import { ScopeService } from "./application/scope.service.js";
import { ScopeController } from "./presentation/scope.controller.js";
@Module({
  imports: [AuthModule, JobsModule],
  controllers: [ScopeController],
  providers: [TenantContextGuard, ScopeService],
})
export class ScopeModule {}
