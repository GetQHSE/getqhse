import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Get("live")
  @ApiOkResponse({ description: "Process is alive" })
  live() {
    return { status: "ok", check: "live" };
  }

  @Get("ready")
  @ApiOkResponse({ description: "Process is ready" })
  ready() {
    return { status: "ok", check: "ready" };
  }
}
