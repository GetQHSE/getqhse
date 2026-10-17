import "./otel.js";
import "reflect-metadata";

import { startLlmSettingsSync, startAiPromptSync } from "@qhse/ai";
import { adminApiEnvironmentSchema } from "@qhse/config";
import { createPrismaClient } from "@qhse/database";

import { createApplication } from "./bootstrap.js";

async function bootstrap() {
  const environment = adminApiEnvironmentSchema.parse(process.env);
  const configurationDatabase = createPrismaClient();
  await startLlmSettingsSync(configurationDatabase);
  await startAiPromptSync(configurationDatabase);
  const app = await createApplication(environment);
  await app.listen(environment.ADMIN_API_PORT, environment.ADMIN_API_HOST);
}

void bootstrap();
