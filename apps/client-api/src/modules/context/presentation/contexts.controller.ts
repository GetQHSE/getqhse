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
  saveContextInternalInputsSchema,
  setContextAnalysisMethodsSchema,
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
  @ApiOkResponse({ description: "Analysis methods (SWOT and/or PESTEL)" })
  getSettings(@Req() request: QhseRequest, @Param("projectIdOrSlug") projectIdOrSlug: string) {
    return this.contexts.getSettings(request.tenant!, projectIdOrSlug);
  }

  @Post("settings/methods")
  setMethods(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Body() body: unknown,
  ) {
    const input = parse(setContextAnalysisMethodsSchema, body);
    return this.contexts.setMethods(request.tenant!, projectIdOrSlug, input.methods);
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

  @Post("internal-inputs/bulk")
  saveInternalInputs(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Body() body: unknown,
  ) {
    const input = parse(saveContextInternalInputsSchema, body);
    return this.contexts.saveInternalInputs(request.tenant!, projectIdOrSlug, input);
  }

  @Get("internal-issues")
  @ApiOkResponse({ description: "Tab 1 — internal issues deduced from the declared context" })
  listInternalIssues(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
  ) {
    return this.contexts.listInternalIssues(request.tenant!, projectIdOrSlug);
  }

  @Post("internal-issues/runs")
  triggerInternalIssues(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
  ) {
    return this.contexts.triggerInternalIssues(request.tenant!, projectIdOrSlug);
  }

  @Get("scope")
  @ApiOkResponse({ description: "Scope summary shown above step 2" })
  getScope(@Req() request: QhseRequest, @Param("projectIdOrSlug") projectIdOrSlug: string) {
    return this.contexts.getScope(request.tenant!, projectIdOrSlug);
  }

  @Get("external-factors")
  @ApiOkResponse({ description: "Step 2 — factors of the latest completed external run" })
  listExternalFactors(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
  ) {
    return this.contexts.listExternalFactors(request.tenant!, projectIdOrSlug);
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
  @ApiOkResponse({ description: "Internal-issues and synthesis run history" })
  listAnalysisRuns(@Req() request: QhseRequest, @Param("projectIdOrSlug") projectIdOrSlug: string) {
    return this.contexts.listAnalysisRuns(request.tenant!, projectIdOrSlug);
  }

  @Post("runs")
  triggerSynthesis(@Req() request: QhseRequest, @Param("projectIdOrSlug") projectIdOrSlug: string) {
    return this.contexts.triggerSynthesis(request.tenant!, projectIdOrSlug);
  }

  @Get("issues")
  @ApiOkResponse({ description: "Tab 3 — the latest completed synthesis, for evaluation" })
  listIssues(@Req() request: QhseRequest, @Param("projectIdOrSlug") projectIdOrSlug: string) {
    return this.contexts.listIssues(request.tenant!, projectIdOrSlug);
  }

  @Post("synthesis/validate")
  @ApiOkResponse({ description: "Tab 3 — « Valider la synthèse », which unlocks the exports" })
  validateSynthesis(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
  ) {
    return this.contexts.validateSynthesis(request.tenant!, projectIdOrSlug);
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
