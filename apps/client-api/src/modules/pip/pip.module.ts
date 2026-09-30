import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { TenantContextGuard } from "../auth/authorization/tenant-context.guard.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { PipService } from "./application/pip.service.js";
import { PipController } from "./presentation/pip.controller.js";
@Module({
  imports: [AuthModule, JobsModule],
  controllers: [PipController],
  providers: [TenantContextGuard, PipService],
})
export class PipModule {}
