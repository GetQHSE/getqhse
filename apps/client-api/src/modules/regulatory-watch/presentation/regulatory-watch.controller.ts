import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiProduces, ApiTags } from "@nestjs/swagger";
import {
  answerRegulatoryClarificationsSchema,
  createRegulatoryActionSchema,
  createRegulatoryEvidenceSchema,
  decideRegulatoryCandidateSchema,
  publishRegulatoryBaselineSchema,
  startRegulatoryAnalysisSchema,
  updateRegulatoryActionSchema,
  updateRegulatoryEvaluationSchema,
} from "@qhse/contracts";
import type { Response } from "express";

import type { QhseRequest } from "../../../common/request-context.js";
import { TenantContextGuard } from "../../auth/authorization/tenant-context.guard.js";
import { RegulatoryWatchService } from "../application/regulatory-watch.service.js";

function parse<T>(
  schema: {
    safeParse(
      value: unknown,
    ): { success: true; data: T } | { success: false; error: { flatten(): unknown } };
  },
  body: unknown,
): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(result.error.flatten());
  return result.data;
}

@ApiTags("regulatory-watch")
@ApiCookieAuth()
@ApiHeader({ name: "x-organization-id", required: false })
@UseGuards(TenantContextGuard)
@Controller("v1/projects/:projectIdOrSlug/regulatory-watch")
export class RegulatoryWatchController {
  constructor(
    @Inject(RegulatoryWatchService) private readonly regulatory: RegulatoryWatchService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "Current project regulatory register and evaluation state" })
  get(@Req() request: QhseRequest, @Param("projectIdOrSlug") projectIdOrSlug: string) {
    return this.regulatory.get(request.tenant!, projectIdOrSlug);
  }

  @Post("analysis-runs")
  startAnalysis(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Body() body: unknown,
  ) {
    return this.regulatory.startAnalysis(
      request.tenant!,
      projectIdOrSlug,
      parse(startRegulatoryAnalysisSchema, body),
    );
  }

  @Post("analysis-runs/:runId/clarifications")
  answerClarifications(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Param("runId") runId: string,
    @Body() body: unknown,
  ) {
    return this.regulatory.answerClarifications(
      request.tenant!,
      projectIdOrSlug,
      runId,
      parse(answerRegulatoryClarificationsSchema, body),
    );
  }

  @Patch("candidates/:candidateId")
  decideCandidate(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Param("candidateId") candidateId: string,
    @Body() body: unknown,
  ) {
    return this.regulatory.decideCandidate(
      request.tenant!,
      projectIdOrSlug,
      candidateId,
      parse(decideRegulatoryCandidateSchema, body),
    );
  }

  @Post("baselines")
  publish(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Body() body: unknown,
  ) {
    return this.regulatory.publish(
      request.tenant!,
      projectIdOrSlug,
      parse(publishRegulatoryBaselineSchema, body),
    );
  }

  @Post("evaluation-runs")
  startEvaluation(@Req() request: QhseRequest, @Param("projectIdOrSlug") projectIdOrSlug: string) {
    return this.regulatory.startEvaluation(request.tenant!, projectIdOrSlug);
  }

  @Patch("evaluations/:evaluationId")
  updateEvaluation(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Param("evaluationId") evaluationId: string,
    @Body() body: unknown,
  ) {
    return this.regulatory.updateEvaluation(
      request.tenant!,
      projectIdOrSlug,
      evaluationId,
      parse(updateRegulatoryEvaluationSchema, body),
    );
  }

  @Post("evaluations/:evaluationId/evidence")
  addEvidence(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Param("evaluationId") evaluationId: string,
    @Body() body: unknown,
  ) {
    return this.regulatory.addEvidence(
      request.tenant!,
      projectIdOrSlug,
      evaluationId,
      parse(createRegulatoryEvidenceSchema, body),
    );
  }

  @Post("evaluations/:evaluationId/actions")
  addAction(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Param("evaluationId") evaluationId: string,
    @Body() body: unknown,
  ) {
    return this.regulatory.addAction(
      request.tenant!,
      projectIdOrSlug,
      evaluationId,
      parse(createRegulatoryActionSchema, body),
    );
  }

  @Patch("actions/:actionId")
  updateAction(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
    @Param("actionId") actionId: string,
    @Body() body: unknown,
  ) {
    return this.regulatory.updateAction(
      request.tenant!,
      projectIdOrSlug,
      actionId,
      parse(updateRegulatoryActionSchema, body),
    );
  }

  @Get("export.xlsx")
  @ApiProduces("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  async export(
    @Req() request: QhseRequest,
    @Res() response: Response,
    @Param("projectIdOrSlug") projectIdOrSlug: string,
  ) {
    const workbook = await this.regulatory.exportWorkbook(request.tenant!, projectIdOrSlug);
    response.setHeader(
      "content-type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    response.setHeader("content-disposition", 'attachment; filename="veille-reglementaire.xlsx"');
    response.status(200).send(workbook);
  }
}
