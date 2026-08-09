import { Controller, Get, Inject, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";

import { OnboardingService } from "../application/onboarding.service.js";

@ApiTags("onboarding")
@ApiCookieAuth()
@Controller("v1/onboarding")
export class OnboardingController {
  constructor(@Inject(OnboardingService) private readonly onboarding: OnboardingService) {}

  @Get("status")
  @ApiOkResponse({ description: "Authentication and onboarding routing status" })
  status(@Req() request: Request) {
    return this.onboarding.getStatus(request.headers);
  }
}
