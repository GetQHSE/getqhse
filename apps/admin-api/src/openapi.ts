import "reflect-metadata";

import { writeFile } from "node:fs/promises";

import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { createApplication } from "./bootstrap.js";

const environment = {
  NODE_ENV: "development" as const,
  DATABASE_URL: "postgresql://localhost/qhse",
  REDIS_URL: "redis://localhost:6379",
  APP_ORIGIN: "http://localhost:5173",
  CORS_ORIGINS: ["http://localhost:5173"],
  BETTER_AUTH_SECRET: "openapi-generation-secret-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:3000",
  COOKIE_SECURE: false,
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "qhse-files",
  S3_ACCESS_KEY: "openapi",
  S3_SECRET_KEY: "openapi",
  S3_FORCE_PATH_STYLE: true,
  DOCLING_URL: "http://localhost:8000",
  LOG_LEVEL: "info" as const,
  MAX_UPLOAD_BYTES: 10_485_760,
  ADMIN_API_PORT: 3001,
  ADMIN_API_HOST: "0.0.0.0",
  ADMIN_BETTER_AUTH_URL: "http://localhost:3001",
  ADMIN_CORS_ORIGINS: ["http://localhost:5174"],
};

const app = await createApplication(environment);
const document = SwaggerModule.createDocument(
  app,
  new DocumentBuilder().setTitle("QHSE Administration API").setVersion("0.1.0").build(),
);
await writeFile(new URL("../openapi.json", import.meta.url), JSON.stringify(document, null, 2));
await app.close();
