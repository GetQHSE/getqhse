import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  pipEvaluationOutputSchema,
  pipInventoryOutputSchema,
  pipRequirementContentSchema,
  pipRequirementsOutputSchema,
} from "./pip.js";

describe("PIP structured outputs", () => {
  it.each([
    ["inventory", pipInventoryOutputSchema],
    ["requirements", pipRequirementsOutputSchema],
    ["evaluation", pipEvaluationOutputSchema],
  ] as const)("sends an OpenAI-compatible %s schema", (_stage, schema) => {
    expect(JSON.stringify(z.toJSONSchema(schema))).not.toContain('"format":"uri"');
  });

  it("still validates URLs in persisted requirement content", () => {
    const sourceUrl = pipRequirementContentSchema.shape.sourceUrl;
    expect(sourceUrl.safeParse(null).success).toBe(true);
    expect(sourceUrl.safeParse("https://official.example/law").success).toBe(true);
    expect(sourceUrl.safeParse("not a URL").success).toBe(false);
  });
});
