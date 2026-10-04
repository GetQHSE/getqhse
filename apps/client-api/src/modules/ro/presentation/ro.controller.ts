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
import { roLaunchSchema, roWriteSchema } from "@qhse/contracts";
import { smqRo } from "@qhse/domain";
import ExcelJS from "exceljs";
import type { Response } from "express";
import type { z } from "zod";
import type { QhseRequest } from "../../../common/request-context.js";
import { TenantContextGuard } from "../../auth/authorization/tenant-context.guard.js";
import { RoService } from "../application/ro.service.js";
function parse<T>(schema: z.ZodType<T>, body: unknown) {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error);
  return r.data;
}
@ApiTags("risks-opportunities")
@ApiCookieAuth()
@ApiHeader({ name: "x-organization-id", required: false })
@UseGuards(TenantContextGuard)
@Controller("v1/projects/:projectIdOrSlug/ro")
export class RoController {
  constructor(@Inject(RoService) private readonly ro: RoService) {}
  @Get() register(@Req() req: QhseRequest, @Param("projectIdOrSlug") id: string) {
    return this.ro.register(req.tenant!, id);
  }
  @Post("runs") launch(
    @Req() req: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Body() body: unknown,
  ) {
    return this.ro.launch(req.tenant!, id, parse(roLaunchSchema, body));
  }
  @Post("review") review(
    @Req() req: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Body() body: unknown,
  ) {
    return this.ro.write(req.tenant!, id, parse(roWriteSchema, body));
  }
  @Post("validate") validate(@Req() req: QhseRequest, @Param("projectIdOrSlug") id: string) {
    return this.ro.validate(req.tenant!, id);
  }
  @Get("export.xlsx")
  async export(
    @Req() request: QhseRequest,
    @Param("projectIdOrSlug") id: string,
    @Res() response: Response,
  ) {
    const register = await this.ro.register(request.tenant!, id);
    if (
      !register.validatedAt ||
      !smqRo.computeRoWorkflow(register.items, register.outdated).complete
    )
      throw new BadRequestException("RO_REGISTER_INCOMPLETE");
    const labels = smqRo.RO_EXPORT_LABELS[register.language];
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "GetQhse";
    const sheet = workbook.addWorksheet("R&O", {
      views: [{ rightToLeft: register.language === "ar" }],
    });
    sheet.addRow([labels.title]);
    sheet.addRow([
      register.organizationName,
      register.projectName,
      register.standard,
      register.validatedAt,
      "ro-v2",
    ]);
    sheet.addRow([...labels.headers]);
    sheet.getRow(3).font = { bold: true };
    smqRo.roRegisterRows(register.items, register.language).forEach((row) => sheet.addRow(row));
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
    response.setHeader("content-disposition", 'attachment; filename="registre-ro.xlsx"');
    response.send(Buffer.from(await workbook.xlsx.writeBuffer()));
  }
}
