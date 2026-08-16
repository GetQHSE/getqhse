import { createServer, type Server } from "node:http";

import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, Prisma, type DatabaseClient } from "@qhse/database";
import { Redis } from "ioredis";

type HealthCheck = "ok" | "error";

export type WorkerReadiness = {
  status: HealthCheck;
  service: "qhse-worker";
  checks: { database: HealthCheck; redis: HealthCheck };
  regulatory: {
    enabled: boolean;
    openAiConfigured: boolean;
    model: string;
  };
};

@Injectable()
export class WorkerHealthServer implements OnModuleDestroy {
  private readonly database: DatabaseClient = createPrismaClient();
  private readonly redis = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
    lazyConnect: true,
    connectTimeout: 2_000,
    commandTimeout: 2_000,
    maxRetriesPerRequest: 1,
  });
  private server: Server | null = null;

  constructor() {
    this.redis.on("error", () => undefined);
  }

  async readiness(): Promise<WorkerReadiness> {
    const [database, redis] = await Promise.all([
      this.database
        .$queryRaw(Prisma.sql`SELECT 1`)
        .then(() => "ok" as const)
        .catch(() => "error" as const),
      this.redis
        .ping()
        .then(() => "ok" as const)
        .catch(() => "error" as const),
    ]);
    return {
      status: database === "ok" && redis === "ok" ? "ok" : "error",
      service: "qhse-worker",
      checks: { database, redis },
      regulatory: {
        enabled: process.env["NORMATIVE_RAG_ENABLED"] === "true",
        openAiConfigured: Boolean(process.env["OPENAI_API_KEY"]),
        model: process.env["OPENAI_REGULATORY_MODEL"] ?? "gpt-5-mini",
      },
    };
  }

  async listen(): Promise<void> {
    if (this.server) return;
    const host = process.env["WORKER_HOST"] ?? "127.0.0.1";
    const port = Number(process.env["WORKER_PORT"] ?? 4_002);
    this.server = createServer((request, response) => {
      response.setHeader("content-type", "application/json; charset=utf-8");
      if (request.method !== "GET") {
        response
          .writeHead(405)
          .end(JSON.stringify({ status: "error", error: "method_not_allowed" }));
        return;
      }
      if (request.url === "/health/live") {
        response.writeHead(200).end(JSON.stringify({ status: "ok", service: "qhse-worker" }));
        return;
      }
      if (request.url === "/health/ready") {
        void this.readiness().then((readiness) => {
          response.writeHead(readiness.status === "ok" ? 200 : 503).end(JSON.stringify(readiness));
        });
        return;
      }
      response.writeHead(404).end(JSON.stringify({ status: "error", error: "not_found" }));
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(port, host, () => {
        this.server!.off("error", reject);
        resolve();
      });
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
    await Promise.allSettled([this.redis.quit(), this.database.$disconnect()]);
  }
}
