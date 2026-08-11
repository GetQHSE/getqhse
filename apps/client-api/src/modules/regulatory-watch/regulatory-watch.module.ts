import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { TenantContextGuard } from "../auth/authorization/tenant-context.guard.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { RegulatoryWatchService } from "./application/regulatory-watch.service.js";
import { RegulatoryWatchController } from "./presentation/regulatory-watch.controller.js";

@Module({
  imports: [AuthModule, JobsModule],
  controllers: [RegulatoryWatchController],
  providers: [TenantContextGuard, RegulatoryWatchService],
  exports: [RegulatoryWatchService],
})
export class RegulatoryWatchModule {}
