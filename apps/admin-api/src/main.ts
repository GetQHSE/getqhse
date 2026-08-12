import "./otel.js";
import "reflect-metadata";

import { adminApiEnvironmentSchema } from "@qhse/config";

import { createApplication } from "./bootstrap.js";

async function bootstrap() {
  const environment = adminApiEnvironmentSchema.parse(process.env);
  const app = await createApplication(environment);
  await app.listen(environment.ADMIN_API_PORT, environment.ADMIN_API_HOST);
}

void bootstrap();
