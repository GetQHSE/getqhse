import { type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";

import { ApiExceptionFilter } from "./common/api-exception.filter.js";
import { ZodValidationPipe } from "./common/zod-validation.pipe.js";
import { AppModule } from "./app.module.js";
import { BetterAuthAdapter } from "./modules/auth/infrastructure/better-auth.adapter.js";

export async function createApplication(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.enableCors({
    origin: (process.env["CORS_ORIGINS"] ?? "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim()),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  const auth = app.get(BetterAuthAdapter);
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.originalUrl.startsWith("/api/auth/")) {
      return auth.nodeHandler(request, response);
    }
    next();
  });
  app.useBodyParser("json");
  app.useBodyParser("urlencoded", { extended: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableShutdownHooks();
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());

  const openApiConfig = new DocumentBuilder()
    .setTitle("QHSE Platform API")
    .setDescription("Tenant-isolated customer API")
    .setVersion("0.1.0")
    .addCookieAuth("better-auth.session_token")
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, openApiConfig));
  return app;
}
