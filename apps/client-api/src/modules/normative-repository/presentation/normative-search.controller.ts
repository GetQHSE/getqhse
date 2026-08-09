import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { normativeSearchRequestSchema } from "@qhse/contracts";

import type { QhseRequest } from "../../../common/request-context.js";
import { TenantContextGuard } from "../../auth/authorization/tenant-context.guard.js";
import { NormativeRetriever } from "../application/normative-retriever.port.js";

@ApiTags("normative")
@ApiCookieAuth()
@UseGuards(TenantContextGuard)
@Controller("v1/normative")
export class NormativeSearchController {
  constructor(@Inject(NormativeRetriever) private readonly retriever: NormativeRetriever) {}

  @Post("search")
  @ApiOkResponse({ description: "Citation-ready normative retrieval results" })
  search(@Req() request: QhseRequest, @Body() body: unknown) {
    const parsed = normativeSearchRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.retriever.search(request.tenant!.organizationId, parsed.data);
  }
}
