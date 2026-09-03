import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const serviceUrl = process.env["DOCLING_INTEGRATION_URL"];

describe.skipIf(!serviceUrl)("Docling HTTP boundary", () => {
  it("extracts text from a representative PDF", async () => {
    const form = new FormData();
    const fixture = await readFile(
      new URL("../../../tests/fixtures/documents/sample-policy.pdf", import.meta.url),
    );
    form.append("file", new Blob([fixture], { type: "application/pdf" }), "sample-policy.pdf");
    const response = await fetch(`${serviceUrl}/v1/extract`, { method: "POST", body: form });
    expect(response.ok).toBe(true);
    const body = (await response.json()) as {
      text: string;
      pages: unknown[];
      blocks: unknown[];
      metadata: Record<string, string>;
    };
    expect(body.text).toContain("QHSE");
    expect(body.pages.length).toBeGreaterThan(0);

    // The response has to say how the extraction actually went. Without these the worker
    // cannot tell a clean conversion from one that fell back to flat text or one whose text
    // layer never decoded -- all three return plenty of characters.
    expect(body.metadata["provider"]).toBe("docling");
    expect(body.metadata["conversion_status"]).toBe("success");
    expect(body.metadata["text_layer_degenerate"]).toBe("false");
    expect(body.blocks.length).toBeGreaterThan(0);
  });
});
