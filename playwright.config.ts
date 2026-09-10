import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env["CI"] ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env["CI"]
    ? undefined
    : [
        {
          command: "pnpm exec tsx tests/e2e/fake-brevo-server.mts",
          url: "http://127.0.0.1:4179/__health",
          reuseExistingServer: true,
        },
        {
          command: "BREVO_API_BASE_URL=http://127.0.0.1:4179/v3 pnpm dev",
          url: "http://localhost:5173",
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
});
