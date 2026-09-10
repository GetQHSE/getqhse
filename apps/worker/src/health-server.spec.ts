import type { Server } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkerHealthServer } from "./health-server.js";

describe("worker health server", () => {
  const previousHost = process.env["WORKER_HOST"];
  const previousPort = process.env["WORKER_PORT"];
  const previousDatabaseUrl = process.env["DATABASE_URL"];
  const previousRag = process.env["NORMATIVE_RAG_ENABLED"];
  const previousKey = process.env["OPENAI_API_KEY"];

  afterEach(() => {
    restore("WORKER_HOST", previousHost);
    restore("WORKER_PORT", previousPort);
    restore("DATABASE_URL", previousDatabaseUrl);
    restore("NORMATIVE_RAG_ENABLED", previousRag);
    restore("OPENAI_API_KEY", previousKey);
  });

  function restore(key: string, value: string | undefined) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  async function runningServer(options: { databaseAvailable: boolean; redisAvailable: boolean }) {
    process.env["WORKER_HOST"] = "127.0.0.1";
    process.env["WORKER_PORT"] = "0";
    process.env["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/qhse_health_test";
    process.env["NORMATIVE_RAG_ENABLED"] = "true";
    process.env["OPENAI_API_KEY"] = "sk-test";
    const health = new WorkerHealthServer();
    const database = {
      $queryRaw: options.databaseAvailable
        ? vi.fn().mockResolvedValue([{ one: 1 }])
        : vi.fn().mockRejectedValue(new Error("database unavailable")),
      $disconnect: vi.fn().mockResolvedValue(undefined),
    };
    const redis = {
      ping: options.redisAvailable
        ? vi.fn().mockResolvedValue("PONG")
        : vi.fn().mockRejectedValue(new Error("redis unavailable")),
      quit: vi.fn().mockResolvedValue("OK"),
    };
    (health as unknown as { database: object; redis: object }).database = database;
    (health as unknown as { database: object; redis: object }).redis = redis;
    await health.listen();
    const server = (health as unknown as { server: Server }).server;
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected an ephemeral TCP port");
    return { health, baseUrl: `http://127.0.0.1:${address.port}` };
  }

  it("serves live and ready responses when PostgreSQL and Redis are reachable", async () => {
    const { health, baseUrl } = await runningServer({
      databaseAvailable: true,
      redisAvailable: true,
    });
    try {
      const live = await fetch(`${baseUrl}/health/live`);
      const ready = await fetch(`${baseUrl}/health/ready`);
      expect(live.status).toBe(200);
      expect(await live.json()).toMatchObject({ status: "ok", service: "qhse-worker" });
      expect(ready.status).toBe(200);
      expect(await ready.json()).toMatchObject({
        status: "ok",
        checks: { database: "ok", redis: "ok" },
        regulatory: {
          enabled: true,
          providerConfigured: true,
          provider: "openai",
          model: "gpt-5-mini",
        },
      });
    } finally {
      await health.onModuleDestroy();
    }
  });

  it.each([
    {
      unavailable: "PostgreSQL",
      databaseAvailable: false,
      redisAvailable: true,
      checks: { database: "error", redis: "ok" },
    },
    {
      unavailable: "Redis",
      databaseAvailable: true,
      redisAvailable: false,
      checks: { database: "ok", redis: "error" },
    },
  ])(
    "returns 503 readiness while remaining live when $unavailable is unavailable",
    async (input) => {
      const { health, baseUrl } = await runningServer(input);
      try {
        const live = await fetch(`${baseUrl}/health/live`);
        const ready = await fetch(`${baseUrl}/health/ready`);
        expect(live.status).toBe(200);
        expect(ready.status).toBe(503);
        expect(await ready.json()).toMatchObject({ status: "error", checks: input.checks });
      } finally {
        await health.onModuleDestroy();
      }
    },
  );
});
