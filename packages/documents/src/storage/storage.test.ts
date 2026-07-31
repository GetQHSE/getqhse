import { describe, expect, it } from "vitest";
import { sanitizeFileName, validateUploadMetadata } from "./index.js";

describe("document upload security", () => {
  it("removes traversal and unsafe filename characters", () => {
    expect(sanitizeFileName("../../réglement<script>.pdf")).toBe("r_glement_script_.pdf");
  });

  it("rejects mismatched extensions", () => {
    expect(() =>
      validateUploadMetadata(
        { fileName: "payload.exe", mimeType: "application/pdf", sizeBytes: 10 },
        100,
      ),
    ).toThrow();
  });
});
