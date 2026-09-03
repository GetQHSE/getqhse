import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { LlmSettingsController } from "./llm-settings.controller.js";
import { LlmSettingsService } from "./llm-settings.service.js";

@Module({
  imports: [AuthModule],
  controllers: [LlmSettingsController],
  providers: [LlmSettingsService],
})
export class LlmSettingsModule {}
