import { describe, expect, it } from "vitest";

import { apiErrorSchema, createSiteSchema } from "./index.js";

describe("public contracts", () => {
  it("rejects an empty site code", () => {
    expect(
      createSiteSchema.safeParse({ name: "Casablanca plant", code: "", address: null }).success,
    ).toBe(false);
  });

  it("requires request tracing on API errors", () => {
    expect(
      apiErrorSchema.safeParse({
        statusCode: 404,
        code: "NOT_FOUND",
        message: "Missing",
        timestamp: new Date().toISOString(),
        path: "/sites/1",
      }).success,
    ).toBe(false);
  });
});
