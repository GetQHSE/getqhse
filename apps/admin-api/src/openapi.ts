import "reflect-metadata";

import { writeFile } from "node:fs/promises";

import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module.js";

// Preview mode exposes controller metadata without constructing database, Redis or storage clients.
const app = await NestFactory.create(AppModule, { preview: true, logger: false });
const document = SwaggerModule.createDocument(
  app,
  new DocumentBuilder().setTitle("QHSE Administration API").setVersion("0.1.0").build(),
);
await writeFile(new URL("../openapi.json", import.meta.url), JSON.stringify(document, null, 2));
await app.close();
