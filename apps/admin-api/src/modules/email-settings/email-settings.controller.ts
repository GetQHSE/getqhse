import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { emailTypeSchema, updateEmailSettingsSchema } from "@qhse/contracts";

import type { AdminRequest } from "../../common/request-context.js";
import { EmailSettingsService } from "./email-settings.service.js";

@ApiTags("email-settings")
@ApiCookieAuth()
@Controller("v1/email-settings")
export class EmailSettingsController {
  constructor(private readonly settings: EmailSettingsService) {}

  @Get()
  read() {
    return this.settings.read();
  }

  @Put()
  update(@Req() request: AdminRequest, @Body() body: unknown) {
    const input = updateEmailSettingsSchema.safeParse(body);
    if (!input.success) {
      throw new UnprocessableEntityException({
        message: "Request validation failed",
        issues: input.error.issues,
      });
    }
    return this.settings.update(request.platformUser!, input.data);
  }

  @Post("templates/:emailType/validate")
  validate(@Req() request: AdminRequest, @Param("emailType") value: string) {
    const type = emailTypeSchema.safeParse(value);
    if (!type.success) throw new UnprocessableEntityException("Unknown email type");
    return this.settings.validate(request.platformUser!, type.data);
  }

  @Post("templates/:emailType/test")
  test(@Req() request: AdminRequest, @Param("emailType") value: string) {
    const type = emailTypeSchema.safeParse(value);
    if (!type.success) throw new UnprocessableEntityException("Unknown email type");
    return this.settings.sendTest(request.platformUser!, type.data);
  }
}
