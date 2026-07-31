import { All, Controller, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { BetterAuthAdapter } from "../infrastructure/better-auth.adapter.js";

@Controller("api/auth")
export class BetterAuthController {
  constructor(private readonly adapter: BetterAuthAdapter) {}

  @All("*path")
  handle(@Req() request: Request, @Res() response: Response) {
    return this.adapter.nodeHandler(request, response);
  }
}
