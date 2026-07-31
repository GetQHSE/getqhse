import { randomUUID } from "node:crypto";

import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Response } from "express";

import type { QhseRequest } from "./request-context.js";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: QhseRequest, response: Response, next: NextFunction): void {
    const supplied = request.header("x-request-id");
    request.id = supplied && supplied.length <= 128 ? supplied : randomUUID();
    response.setHeader("x-request-id", request.id);
    next();
  }
}
