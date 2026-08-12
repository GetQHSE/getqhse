import "./otel.js";
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { workerEnvironmentSchema } from "@qhse/config";
import { createLogger } from "@qhse/observability";

import { WorkerModule } from "./app.module.js";

async function bootstrap() {
  workerEnvironmentSchema.parse(process.env);
  const logger = createLogger({ base: { service: "qhse-worker" } });
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["error", "warn", "log"],
  });
  app.enableShutdownHooks();
  logger.info("worker_started");
}

void bootstrap();
