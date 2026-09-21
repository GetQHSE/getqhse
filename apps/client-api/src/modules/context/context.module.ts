import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { TenantContextGuard } from "../auth/authorization/tenant-context.guard.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { ContextsService } from "./application/contexts.service.js";
import { ContextsController } from "./presentation/contexts.controller.js";

@Module({
  imports: [AuthModule, JobsModule],
  controllers: [ContextsController],
  providers: [TenantContextGuard, ContextsService],
  exports: [ContextsService],
})
export class ContextModule {}
