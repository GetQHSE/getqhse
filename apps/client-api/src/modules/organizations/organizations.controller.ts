import { Body, Controller, Get, Param, Patch, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { updateMembershipStatusSchema } from "@qhse/contracts";

import type { QhseRequest } from "../../common/request-context.js";
import { TenantContextGuard } from "../auth/authorization/tenant-context.guard.js";
import { OrganizationsService } from "./organizations.service.js";

@ApiTags("organization-invitations")
@Controller("v1/organization-invitations")
export class InvitationPreviewController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get(":invitationId/preview")
  preview(@Param("invitationId") invitationId: string) {
    return this.organizations.invitationPreview(invitationId);
  }
}

@ApiTags("organization-members")
@ApiCookieAuth()
@ApiHeader({ name: "x-organization-id", required: false })
@UseGuards(TenantContextGuard)
@Controller("v1")
export class OrganizationTeamController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get("organization-team")
  team(@Req() request: QhseRequest) {
    return this.organizations.team(request.tenant!);
  }

  @Patch("organization-members/:memberId/status")
  updateStatus(
    @Req() request: QhseRequest,
    @Param("memberId") memberId: string,
    @Body() body: unknown,
  ) {
    return this.organizations.updateMembershipStatus(
      request.tenant!,
      request.id,
      memberId,
      updateMembershipStatusSchema.parse(body),
    );
  }
}
