import { startTelemetry } from "@qhse/observability";

// Side-effect module: imported first from main.ts so auto-instrumentation
// patches http/express/pg/ioredis before those modules are evaluated.
startTelemetry(process.env["SERVICE_NAME"] ?? "qhse-client-api");
