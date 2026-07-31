import "reflect-metadata";

import { serverEnvironmentSchema } from "@qhse/config";

import { createApplication } from "./bootstrap.js";

async function bootstrap() {
  const environment = serverEnvironmentSchema.parse(process.env);
  const app = await createApplication();
  await app.listen(Number(process.env["API_PORT"] ?? 3000), process.env["API_HOST"] ?? "0.0.0.0");
  return environment;
}

void bootstrap();
