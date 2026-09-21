import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiProduces, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import {
  addContextIssueEvidenceSchema,
  applyContextIssueOverrideSchema,
  contextAnswerAssistRequestSchema,
  createManualContextIssueSchema,
  setContextAnalysisMethodSchema,
  upsertContextInternalInputSchema,
} from "@qhse/contracts";

import type { QhseRequest } from "../../../common/request-context.js";
import { TenantContextGuard } from "../../auth/authorization/tenant-context.guard.js";
import { ContextsService } from "../application/contexts.service.js";

function parse<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: unknown } },
  body: unknown,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(parsed.error);
  return parsed.data as T;
}

@ApiTags("context")
@ApiCookieAuth()
@ApiHeader({ name: "x-organization-id", required: false })
@UseGuards(TenantContextGuard)
@Controller("v1/projects/:projectIdOrSlug/context")
export class ContextsController {
  constructor(@Inject(ContextsService) private readonly contexts: ContextsService) {}

  @Get("settings")
  @ApiOkResponse({ description: "Analysis method choice (SWOT or PESTEL)" })
  getSettings(@Req() request: QhseRequest, @Param("projectIdOrSlug") projectIdOrSlug: string) {
    return this.contexts.getSettings(request.tenant!, projectIdOrSlug);
  }

  @Post("settings/method")
  setMethod(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Body() body: unknown,
  ) {
    const input = parse(setContextAnalysisMethodSchema, body);
    return this.contexts.setMethod(request.tenant!, projectIdOrSlug, input.method);
  }

  @Get("internal-inputs")
  @ApiOkResponse({ description: "Step 1 — contexte interne, declared by the human" })
  listInternalInputs(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
  ) {
    return this.contexts.listInternalInputs(request.tenant!, projectIdOrSlug);
  }

  @Post("internal-inputs")
  upsertInternalInput(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Body() body: unknown,
  ) {
    const input = parse(upsertContextInternalInputSchema, body);
    return this.contexts.upsertInternalInput(request.tenant!, projectIdOrSlug, input);
  }

  @Post("internal-inputs/assist")
  assistInternalInputAnswer(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Body() body: unknown,
  ) {
    const input = parse(contextAnswerAssistRequestSchema, body);
    return this.contexts.assistInternalInputAnswer(request.tenant!, projectIdOrSlug, input);
  }

  @Get("external-runs")
  @ApiOkResponse({ description: "Step 2 — analyse externe run history" })
  listExternalRuns(@Req() request: QhseRequest, @Param("projectIdOrSlug") projectIdOrSlug: string) {
    return this.contexts.listExternalRuns(request.tenant!, projectIdOrSlug);
  }

  @Post("external-runs")
  triggerExternalResearch(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
  ) {
    return this.contexts.triggerExternalResearch(request.tenant!, projectIdOrSlug);
  }

  @Get("runs")
  @ApiOkResponse({ description: "Step 3 — synthèse des enjeux run history" })
  listAnalysisRuns(@Req() request: QhseRequest, @Param("projectIdOrSlug") projectIdOrSlug: string) {
    return this.contexts.listAnalysisRuns(request.tenant!, projectIdOrSlug);
  }

  @Post("runs")
  triggerSynthesis(@Req() request: QhseRequest, @Param("projectIdOrSlug") projectIdOrSlug: string) {
    return this.contexts.triggerSynthesis(request.tenant!, projectIdOrSlug);
  }

  @Get("issues")
  @ApiOkResponse({ description: "Step 4 — the latest completed run's register, for validation" })
  listIssues(@Req() request: QhseRequest, @Param("projectIdOrSlug") projectIdOrSlug: string) {
    return this.contexts.listIssues(request.tenant!, projectIdOrSlug);
  }

  @Post("issues")
  createManualIssue(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Body() body: unknown,
  ) {
    const input = parse(createManualContextIssueSchema, body);
    return this.contexts.createManualIssue(request.tenant!, projectIdOrSlug, input);
  }

  @Post("issues/:issueId/override")
  applyIssueOverride(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Param("issueId") issueId: string,
    @Body() body: unknown,
  ) {
    const input = parse(applyContextIssueOverrideSchema, body);
    return this.contexts.applyIssueOverride(request.tenant!, projectIdOrSlug, issueId, input);
  }

  @Post("issues/:issueId/evidence")
  addIssueEvidence(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Param("issueId") issueId: string,
    @Body() body: unknown,
  ) {
    const input = parse(addContextIssueEvidenceSchema, body);
    return this.contexts.addIssueEvidence(request.tenant!, projectIdOrSlug, issueId, input);
  }

  @Get("export.xlsx")
  @ApiProduces("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  async export(
    @Req() request: QhseRequest,
    @Res() response: Response,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
  ) {
    const { buffer, fileName } = await this.contexts.exportRegisterWorkbook(
      request.tenant!,
      projectIdOrSlug,
    );
    response.setHeader(
      "content-type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    response.setHeader("content-disposition", `attachment; filename="${fileName}"`);
    response.status(200).send(buffer);
  }
}
