import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { describe, expect, it } from "vitest";

import { createSiteSchema, siteSchema } from "@qhse/contracts";

const openApiPath = new URL("../../apps/client-api/openapi.json", import.meta.url);

describe("OpenAPI and Zod contracts", () => {
  it("keeps the generated site client surface compatible", () => {
    expect(createSiteSchema.keyof().options.sort()).toEqual(["address", "code", "name"]);
    expect(siteSchema.keyof().options).toContain("organizationId");
  });

  it("contains the routes consumed by the typed client when OpenAPI has been generated", async () => {
    try {
      await access(openApiPath, constants.R_OK);
    } catch {
      return;
    }
    const document = JSON.parse(await readFile(openApiPath, "utf8")) as {
      paths: Record<string, unknown>;
    };
    expect(document.paths["/v1/sites"]).toBeDefined();
  });
});
