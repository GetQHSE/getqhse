import "./otel.js";
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { workerEnvironmentSchema } from "@qhse/config";
import { createLogger } from "@qhse/observability";

import { WorkerModule } from "./app.module.js";
import { WorkerHealthServer } from "./health-server.js";

async function bootstrap() {
  workerEnvironmentSchema.parse(process.env);
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
