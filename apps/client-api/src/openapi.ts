import { writeFile } from "node:fs/promises";

import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

process.env["DATABASE_URL"] ??= "postgresql://qhse_app:change-me@localhost:5432/qhse";
process.env["BETTER_AUTH_SECRET"] ??= "openapi-generation-secret-is-not-used-at-runtime";
process.env["BETTER_AUTH_URL"] ??= "http://localhost:3000";

const { createApplication } = await import("./bootstrap.js");

const app = await createApplication();
const document = SwaggerModule.createDocument(
  app,
  new DocumentBuilder().setTitle("QHSE Platform API").setVersion("0.1.0").build(),
);
await writeFile(new URL("../openapi.json", import.meta.url), JSON.stringify(document, null, 2));
await app.close();
