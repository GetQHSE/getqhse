import "./otel.js";
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { startLlmSettingsSync } from "@qhse/ai";
import { workerEnvironmentSchema } from "@qhse/config";
import { createPrismaClient } from "@qhse/database";
import { createLogger } from "@qhse/observability";

import { WorkerModule } from "./app.module.js";
import { WorkerHealthServer } from "./health-server.js";

async function bootstrap() {
  workerEnvironmentSchema.parse(process.env);
  // The LLM configuration lives in a database row the admin workspace edits; load it before any
  // queue starts so the first job already runs on the configured models.
  await startLlmSettingsSync(createPrismaClient());
  const logger = createLogger({ base: { service: "qhse-worker" } });
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["error", "warn", "log"],
  });
  app.enableShutdownHooks();
  const healthServer = app.get(WorkerHealthServer);
  await healthServer.listen();
  logger.info(
    {
      host: process.env["WORKER_HOST"] ?? "127.0.0.1",
      port: Number(process.env["WORKER_PORT"] ?? 4_002),
    },
    "worker_started",
  );
}

void bootstrap();
