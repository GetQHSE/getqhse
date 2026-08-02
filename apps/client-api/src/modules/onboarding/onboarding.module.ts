import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { TenantContextGuard } from "../auth/authorization/tenant-context.guard.js";
import { OnboardingService } from "./application/onboarding.service.js";
import { OnboardingController } from "./presentation/onboarding.controller.js";

@Module({
  imports: [AuthModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, TenantContextGuard],
})
export class OnboardingModule {}
