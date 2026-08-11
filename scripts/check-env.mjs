import { readFile } from "node:fs/promises";

const examples = [".env.example", ".env.production.example"];

async function parseExample(path) {
  const content = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const values = new Map();

  for (const [index, rawLine] of content.split("\n").entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) throw new Error(`${path}:${index + 1} is not a valid KEY=value entry`);
    const [, key, value] = match;
    if (values.has(key)) throw new Error(`${path} declares ${key} more than once`);
    values.set(key, value);
  }

  return values;
}

const parsed = new Map(
  await Promise.all(examples.map(async (path) => [path, await parseExample(path)])),
);

for (const [path, values] of parsed) {
  const forbidden = [...values.keys()].filter(
    (key) => key.startsWith("VITE_") && /SECRET|PASSWORD|TOKEN|DATABASE|REDIS|S3_/i.test(key),
  );
  if (forbidden.length > 0) {
    throw new Error(`${path} exposes server secrets through Vite: ${forbidden.join(", ")}`);
  }
}

const requiredProductionKeys = [
  "APP_ORIGIN",
  "CORS_ORIGINS",
  "BETTER_AUTH_URL",
  "ADMIN_CORS_ORIGINS",
  "ADMIN_BETTER_AUTH_URL",
  "VITE_API_URL",
  "VITE_ADMIN_API_URL",
  "DATABASE_URL",
  "REDIS_URL",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "BETTER_AUTH_SECRET",
];
const production = parsed.get(".env.production.example");
const missing = requiredProductionKeys.filter((key) => !production.has(key));
if (missing.length > 0) {
  throw new Error(`.env.production.example is missing: ${missing.join(", ")}`);
}

console.info(`Environment examples are valid (${examples.join(", ")})`);
