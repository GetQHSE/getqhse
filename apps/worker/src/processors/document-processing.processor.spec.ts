import { describe, expect, it } from "vitest";

import { chunkText, detectSections } from "./document-processing.processor.js";

describe("document processing review outputs", () => {
  it("detects titled sections while preserving their content", () => {
    const sections = detectSections(
      "1 Scope\n\nThis standard covers occupational safety.\n\n2 Requirements\n\nWorkers must use protective equipment.",
    );

    expect(sections).toEqual([
      {
        title: "1 Scope",
        content: "This standard covers occupational safety.",
        orderIndex: 0,
      },
      {
        title: "2 Requirements",
        content: "Workers must use protective equipment.",
        orderIndex: 1,
      },
    ]);
  });

  it("creates stable non-empty chunks without dropping paragraphs", () => {
    const chunks = chunkText("First paragraph.\n\nSecond paragraph.\n\nThird paragraph.", 35);

    expect(chunks).toEqual(["First paragraph.\n\nSecond paragraph.", "Third paragraph."]);
    expect(chunks.join("\n\n")).toContain("Second paragraph.");
  });
});
