import { startTelemetry } from "@qhse/observability";

// Side-effect module: imported first from main.ts so auto-instrumentation
// patches http/pg/ioredis/bullmq before those modules are evaluated.
startTelemetry(process.env["SERVICE_NAME"] ?? "qhse-worker");
