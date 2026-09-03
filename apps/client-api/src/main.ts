import "./otel.js";
import "reflect-metadata";

import { startLlmSettingsSync } from "@qhse/ai";
import { serverEnvironmentSchema } from "@qhse/config";
import { createPrismaClient } from "@qhse/database";

import { createApplication } from "./bootstrap.js";

async function bootstrap() {
  const environment = serverEnvironmentSchema.parse(process.env);
  await startLlmSettingsSync(createPrismaClient());
  const app = await createApplication();
  await app.listen(Number(process.env["API_PORT"] ?? 3000), process.env["API_HOST"] ?? "0.0.0.0");
  return environment;
}

void bootstrap();
