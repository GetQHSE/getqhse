import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { TenantContextGuard } from "../auth/authorization/tenant-context.guard.js";
import { ProcessSheetsController } from "./presentation/process-sheets.controller.js";
import { ProcessSheetsService } from "./application/process-sheets.service.js";
@Module({
  imports: [AuthModule, JobsModule],
  controllers: [ProcessSheetsController],
  providers: [TenantContextGuard, ProcessSheetsService],
})
export class ProcessSheetsModule {}
