import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
  preview: { port: 5174 },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    // jsdom UI tests take ~0.5 s alone but several seconds when turbo runs
    // every package's suite in parallel; 5 s left them timing out under load.
    testTimeout: 20_000,
  },
});
