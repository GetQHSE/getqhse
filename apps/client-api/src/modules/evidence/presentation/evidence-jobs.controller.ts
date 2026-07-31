import {
  BadRequestException,
  Controller,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiAcceptedResponse, ApiCookieAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { workQueueNames } from "@qhse/contracts";

import type { QhseRequest } from "../../../common/request-context.js";
import { TenantContextGuard } from "../../auth/authorization/tenant-context.guard.js";
import { WorkQueueService } from "../../jobs/work-queue.service.js";

@ApiTags("evidence")
@ApiCookieAuth()
@UseGuards(TenantContextGuard)
@Controller("v1/evidence")
export class EvidenceJobsController {
  constructor(private readonly work: WorkQueueService) {}

  @Post(":evidenceId/analysis-jobs")
  @ApiHeader({ name: "idempotency-key", required: true })
  @ApiAcceptedResponse({ description: "Evidence analysis was queued" })
  enqueueAnalysis(
    @Req() request: QhseRequest,
    @Param("evidenceId") evidenceId: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    if (!idempotencyKey) throw new BadRequestException("idempotency-key is required");
    return this.work.enqueue(workQueueNames.evidenceAnalysis, "analyze-evidence", {
      organizationId: request.tenant!.organizationId,
      correlationId: request.id,
      idempotencyKey,
      payload: { evidenceId },
    });
  }
}
