import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";

import type { QhseRequest } from "./request-context.js";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<QhseRequest>();
    const response = http.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : undefined;
    const message =
      typeof raw === "object" && raw !== null && "message" in raw
        ? String(raw.message)
        : exception instanceof Error && status < 500
          ? exception.message
          : "An unexpected error occurred";

    response.status(status).json({
      statusCode: status,
      code: exception instanceof HttpException ? exception.name : "INTERNAL_SERVER_ERROR",
      message,
      ...(typeof raw === "object" && raw !== null ? { details: raw } : {}),
      requestId: request.id ?? "unknown",
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }
}
