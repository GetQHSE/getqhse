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
import { ApiCookieAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import {
  pipLaunchSchema,
  pipReviewSchema,
  pipAllocationSchema,
  pipAddPartySchema,
  pipAddRequirementSchema,
  pipAnswerSchema,
} from "@qhse/contracts";
import { smqPip } from "@qhse/domain";
import ExcelJS from "exceljs";
import type { Response } from "express";
import type { z } from "zod";
import type { QhseRequest } from "../../../common/request-context.js";
import { TenantContextGuard } from "../../auth/authorization/tenant-context.guard.js";
import { PipService } from "../application/pip.service.js";

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(result.error);
  return result.data;
}
@ApiTags("pip")
@ApiCookieAuth()
@ApiHeader({ name: "x-organization-id", required: false })
@UseGuards(TenantContextGuard)
@Controller("v1/projects/:projectIdOrSlug/pip")
export class PipController {
  constructor(@Inject(PipService) private readonly pip: PipService) {}
  @Get()
  register(@Req() request: QhseRequest, @Param("projectIdOrSlug") id: string) {
    return this.pip.register(request.tenant!, id);
  }
  @Post("runs")
  launch(@Req() request: QhseRequest, @Param("projectIdOrSlug") id: string, @Body() body: unknown) {
    return this.pip.launch(request.tenant!, id, parse(pipLaunchSchema, body));
  }
  @Post("review")
  review(@Req() request: QhseRequest, @Param("projectIdOrSlug") id: string, @Body() body: unknown) {
    return this.pip.review(request.tenant!, id, parse(pipReviewSchema, body));
  }
  @Post("parties")
  addParty(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Body() body: unknown,
  ) {
    return this.pip.addParty(request.tenant!, id, parse(pipAddPartySchema, body));
  }
  @Post("requirements")
  addRequirement(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Body() body: unknown,
  ) {
    return this.pip.addRequirement(request.tenant!, id, parse(pipAddRequirementSchema, body));
  }
  @Post("allocation")
  allocate(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Body() body: unknown,
  ) {
    return this.pip.allocate(request.tenant!, id, parse(pipAllocationSchema, body));
  }
  @Post("clarifications")
  answer(@Req() request: QhseRequest, @Param("projectIdOrSlug") id: string, @Body() body: unknown) {
    return this.pip.answer(request.tenant!, id, parse(pipAnswerSchema, body));
  }
  @Post("validate")
  validate(@Req() request: QhseRequest, @Param("projectIdOrSlug") id: string) {
    return this.pip.validate(request.tenant!, id);
  }
  @Get("export.xlsx")
  async export(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Res() response: Response,
  ) {
    const register = await this.pip.register(request.tenant!, id);
    if (
      !register.validatedAt ||
      !smqPip.computePipWorkflow(register.parties, register.evaluationMethod, register.outdated)
        .complete
    )
      throw new BadRequestException("PIP_REGISTER_INCOMPLETE");
    const labels = smqPip.PIP_EXPORT_LABELS[register.language];
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "GetQhse";
    const sheet = workbook.addWorksheet("PIP", {
      views: [{ rightToLeft: register.language === "ar" }],
    });
    sheet.addRow([labels.title]);
    sheet.addRow([
      register.organizationName,
      register.projectName,
      register.standard,
      register.validatedAt,
      "pip-v1",
    ]);
    sheet.addRow([...labels.headers]);
    sheet.getRow(3).font = { bold: true };
    smqPip
      .pipRegisterRows(register.parties, register.evaluationMethod, register.language)
      .forEach((row) => sheet.addRow(row));
    sheet.columns.forEach((column) => {
      column.width = 30;
    });
    sheet.eachRow((row) => {
      row.alignment = { vertical: "top", wrapText: true };
    });
    response.setHeader(
      "content-type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    response.setHeader("content-disposition", 'attachment; filename="registre-pip.xlsx"');
    response.send(Buffer.from(await workbook.xlsx.writeBuffer()));
  }
}
