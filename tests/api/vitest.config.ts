import { defineConfig } from "vitest/config";

import { workspaceAliases } from "../vitest.workspace-aliases.js";

export default defineConfig({
  root: import.meta.dirname,
  resolve: { alias: workspaceAliases },
  test: { include: ["*.test.ts"], testTimeout: 30_000 },
});
