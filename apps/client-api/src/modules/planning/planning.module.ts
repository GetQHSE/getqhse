import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { TenantContextGuard } from "../auth/authorization/tenant-context.guard.js";
import { PlanningController } from "./presentation/planning.controller.js";
import { PlanningService } from "./application/planning.service.js";
@Module({
  imports: [AuthModule, JobsModule],
  controllers: [PlanningController],
  providers: [TenantContextGuard, PlanningService],
})
export class PlanningModule {}
