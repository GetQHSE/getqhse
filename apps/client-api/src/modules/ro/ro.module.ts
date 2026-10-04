import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { TenantContextGuard } from "../auth/authorization/tenant-context.guard.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { RoService } from "./application/ro.service.js";
import { RoController } from "./presentation/ro.controller.js";
@Module({
  imports: [AuthModule, JobsModule],
  controllers: [RoController],
  providers: [TenantContextGuard, RoService],
})
export class RoModule {}
