import { fileURLToPath } from "node:url";

const workspacePackageEntries = {
  "@qhse/ai": "../packages/ai/src/index.ts",
  "@qhse/api-client": "../packages/api-client/src/index.ts",
  "@qhse/auth": "../packages/auth/src/index.ts",
  "@qhse/config": "../packages/config/src/index.ts",
  "@qhse/contracts": "../packages/contracts/src/index.ts",
  "@qhse/database": "../packages/database/src/index.ts",
  "@qhse/documents": "../packages/documents/src/index.ts",
  "@qhse/domain": "../packages/domain/src/index.ts",
  "@qhse/knowledge": "../packages/knowledge/src/index.ts",
  "@qhse/observability": "../packages/observability/src/index.ts",
  "@qhse/profile": "../packages/profile/src/index.ts",
  "@qhse/test-utils": "../packages/test-utils/src/index.ts",
  "@qhse/ui": "../packages/ui/src/index.tsx",
} as const;

export const workspaceAliases = Object.fromEntries(
  Object.entries(workspacePackageEntries).map(([name, path]) => [
    name,
    fileURLToPath(new URL(path, import.meta.url)),
  ]),
);
