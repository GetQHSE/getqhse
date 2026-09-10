import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { EmailSettingsController } from "./email-settings.controller.js";
import { EmailSettingsService } from "./email-settings.service.js";

@Module({
  imports: [AuthModule],
  controllers: [EmailSettingsController],
  providers: [EmailSettingsService],
})
export class EmailSettingsModule {}
