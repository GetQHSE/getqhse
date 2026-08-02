import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";

import type { QhseRequest } from "../../../common/request-context.js";
import { TenantContextGuard } from "../../auth/authorization/tenant-context.guard.js";
import { OnboardingService } from "../application/onboarding.service.js";

@ApiTags("onboarding")
@ApiCookieAuth()
@ApiHeader({ name: "x-organization-id", required: false })
@UseGuards(TenantContextGuard)
@Controller("v1/onboarding")
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get("status")
  @ApiOkResponse({ description: "Tenant onboarding status" })
  status(@Req() request: QhseRequest) {
    return this.onboarding.getStatus(request.tenant!);
  }
}
