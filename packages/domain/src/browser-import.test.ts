import { describe, expect, it, vi } from "vitest";

// Vite externalizes Node built-ins. Loading the shared domain barrel in a browser must not
// access them, even when a page only needs the PIP workflow's synchronous helpers.
vi.mock("node:crypto", () => {
  throw new Error("Server-only crypto imported by shared domain");
});
vi.mock("node:util", () => {
  throw new Error("Server-only util imported by shared domain");
});

import { smqContext, smqPip } from "./index.js";

describe("browser-safe domain imports", () => {
  it("loads PIP and preserves the persisted SHA-256 identity format without Node built-ins", async () => {
    expect(smqPip.canonicalPipKey("Clients")).toBe("clients");
    await expect(smqContext.issueFingerprint("project-1", "INTERNAL", "achats")).resolves.toBe(
      "32cd567c9ae0a1bda3aee619f6c52ecc20815c49237d7e41ace86fbc2934b2e6",
    );
  });
});
