import { type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { AdminApiEnvironment } from "@qhse/config";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module.js";
import { AuthService } from "./modules/auth/auth.service.js";

export async function createApplication(
  environment: AdminApiEnvironment,
): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.enableCors({
    origin: environment.ADMIN_CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  const auth = app.get(AuthService);
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

  const openApiConfig = new DocumentBuilder()
    .setTitle("QHSE Administration API")
    .setDescription("Internal normative-content management API")
    .setVersion("0.1.0")
    .addCookieAuth("better-auth.session_token")
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, openApiConfig));
  return app;
}
