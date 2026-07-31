import { readFile } from "node:fs/promises";

const content = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const viteKeys = content
  .split("\n")
  .filter((line) => line.startsWith("VITE_"))
  .map((line) => line.split("=")[0]);
const forbidden = viteKeys.filter((key) => /SECRET|PASSWORD|TOKEN|DATABASE|REDIS|S3_/i.test(key));
if (forbidden.length > 0) {
  throw new Error(`Server secrets must not use VITE_ prefixes: ${forbidden.join(", ")}`);
}
console.info("Environment variable prefix check passed");
