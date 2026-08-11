import { describe, expect, it } from "vitest";

import { serverEnvironmentSchema } from "./index.js";

describe("serverEnvironmentSchema", () => {
  it("treats a blank optional OpenAI key as not configured", () => {
    expect(serverEnvironmentSchema.shape.OPENAI_API_KEY.parse("")).toBeUndefined();
    expect(serverEnvironmentSchema.shape.OPENAI_API_KEY.parse(undefined)).toBeUndefined();
    expect(serverEnvironmentSchema.shape.OPENAI_API_KEY.parse("test-key")).toBe("test-key");
  });
});
