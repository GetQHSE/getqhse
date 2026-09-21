import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { TenantContextGuard } from "../auth/authorization/tenant-context.guard.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { ContextAnswerAssistModelPort } from "./application/context-answer-assist-model.port.js";
import { ContextsService } from "./application/contexts.service.js";
import { AiContextAnswerAssistAdapter } from "./infrastructure/ai-context-answer-assist.adapter.js";
import { ContextsController } from "./presentation/contexts.controller.js";

@Module({
  imports: [AuthModule, JobsModule],
  controllers: [ContextsController],
  providers: [
    TenantContextGuard,
    ContextsService,
    { provide: ContextAnswerAssistModelPort, useClass: AiContextAnswerAssistAdapter },
  ],
  exports: [ContextsService],
})
export class ContextModule {}
