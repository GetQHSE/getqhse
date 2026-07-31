import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";

import { Public } from "../../common/public.decorator.js";

@ApiTags("health")
@Public()
@Controller("health")
export class HealthController {
  @Get("live")
  @ApiOkResponse({ description: "Process is alive" })
  live() {
    return { status: "ok", check: "live", service: "admin-api" };
  }

  @Get("ready")
  @ApiOkResponse({ description: "Process is ready" })
  ready() {
    return { status: "ok", check: "ready", service: "admin-api" };
  }
}
