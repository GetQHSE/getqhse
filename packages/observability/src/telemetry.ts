import { diag, DiagConsoleLogger, DiagLogLevel, trace } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions/incubating";

/**
 * OTLP endpoint of the collector (Grafana Alloy in dev). Traces are pushed to
 * `${endpoint}/v1/traces`. Apps run on the host under `pnpm dev` and inside
 * Docker in production, so this is always configured via env rather than
 * assumed.
 */
function otlpEndpoint(): string {
  return (process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] ?? "http://localhost:4318").replace(/\/$/, "");
}

let sdk: NodeSDK | undefined;

/**
 * Starts tracing for the current process. Must run before the app imports
 * anything it wants instrumented (http, express, nestjs, pg, ioredis, bullmq),
 * because auto-instrumentation patches those modules as they load — hence the
 * dedicated `telemetry.ts` bootstrap imported first in each app's main.ts.
 *
 * Safe to call when telemetry is disabled: it becomes a no-op and the app runs
 * untouched.
 */
export function startTelemetry(serviceName: string): void {
  if (process.env["OTEL_SDK_DISABLED"] === "true") return;
  if (sdk) return;

  if (process.env["OTEL_DIAG"] === "true") {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
  }

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env["APP_VERSION"] ?? "0.1.0",
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env["NODE_ENV"] ?? "development",
    }),
    traceExporter: new OTLPTraceExporter({ url: `${otlpEndpoint()}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Noisy and low-value: every file read becomes a span.
        "@opentelemetry/instrumentation-fs": { enabled: false },
        // Stamps trace_id/span_id onto every pino line, which is what links a
        // log in Loki back to its trace in Tempo.
        "@opentelemetry/instrumentation-pino": { enabled: true },
      }),
    ],
  });

  sdk.start();

  const shutdown = async (): Promise<void> => {
    try {
      await sdk?.shutdown();
    } catch {
      // Never let telemetry teardown block process exit.
    }
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}

/**
 * Current trace id, for surfacing in API error responses or job records so a
 * user-reported failure can be pasted straight into Tempo.
 */
export function currentTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  const id = span?.spanContext().traceId;
  return id && id !== "00000000000000000000000000000000" ? id : undefined;
}
