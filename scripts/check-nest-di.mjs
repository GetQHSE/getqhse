// Resolves every NestJS app's dependency graph from its compiled dist/, the way the
// production containers load it. Dev (tsx) and unit tests (vitest) compile through esbuild,
// which emits no decorator metadata, so an injection error such as a type-only constructor
// parameter without @Optional() or @Inject() only surfaces in the tsc build. Run after
// `pnpm build`.
//
// Preview mode still resolves every constructor dependency but never calls the constructors,
// so the check needs no database, Redis or object storage.

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const apps = [
  { name: "client-api", module: "AppModule" },
  { name: "admin-api", module: "AppModule" },
  { name: "worker", module: "WorkerModule" },
];

// Mirrors the placeholders src/openapi.ts uses; modules that read them at import time only
// need them to be well-formed.
process.env["DATABASE_URL"] ??= "postgresql://qhse_app:change-me@localhost:5432/qhse";
process.env["BETTER_AUTH_SECRET"] ??= "di-check-secret-is-not-used-at-runtime";
process.env["BETTER_AUTH_URL"] ??= "http://localhost:3000";

let failed = false;

for (const app of apps) {
  const appRoot = new URL(`../apps/${app.name}/`, import.meta.url);
  // Load Nest from the app's own dependency tree so the check shares the metadata registry
  // and container classes its compiled modules use.
  const require = createRequire(new URL("package.json", appRoot));
  await import(pathToFileURL(require.resolve("reflect-metadata")).href);
  const { NestFactory } = await import(pathToFileURL(require.resolve("@nestjs/core")).href);

  try {
    const compiled = await import(new URL(`dist/app.module.js`, appRoot).href);
    const context = await NestFactory.createApplicationContext(compiled[app.module], {
      preview: true,
      abortOnError: false,
      logger: false,
    });
    await context.close();
    console.log(`✓ ${app.name}`);
  } catch (error) {
    failed = true;
    console.error(`✗ ${app.name}\n${error instanceof Error ? error.message : String(error)}\n`);
  }
}

process.exit(failed ? 1 : 0);
