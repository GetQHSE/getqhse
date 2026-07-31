import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { TenantContextGuard } from "../auth/authorization/tenant-context.guard.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { EvidenceJobsController } from "./presentation/evidence-jobs.controller.js";

@Module({
  imports: [AuthModule, JobsModule],
  controllers: [EvidenceJobsController],
  providers: [TenantContextGuard],
})
export class EvidenceModule {}
