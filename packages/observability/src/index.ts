import pino, { type LoggerOptions } from "pino";

export { startTelemetry, currentTraceId } from "./telemetry.js";

const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "password",
  "token",
  "secret",
  "*.password",
  "*.token",
  "*.secret",
  "evidence.content",
];

function serviceName(): string {
  return process.env["SERVICE_NAME"] ?? "qhse-platform";
}

/**
 * Ships logs to the collector over OTLP so they land in Loki with the same
 * resource attributes the traces carry — that shared `service.name` is what
 * lets a Tempo span link across to its logs.
 *
 * Disabled by default so `pnpm dev` without the observability stack running
 * stays quiet; opt in with LOG_OTLP=true (compose sets it for you).
 */
function transport(): LoggerOptions["transport"] {
  if (process.env["LOG_OTLP"] !== "true") return undefined;
  return {
    target: "pino-opentelemetry-transport",
    options: {
      logRecordProcessorOptions: {
        recordProcessorType: "batch",
        exporterOptions: { protocol: "http/protobuf" },
      },
      resourceAttributes: {
        "service.name": serviceName(),
        "deployment.environment.name": process.env["NODE_ENV"] ?? "development",
      },
    },
  };
}

export function createLogger(options: LoggerOptions = {}) {
  const target = transport();
  return pino({
    level: process.env["LOG_LEVEL"] ?? "info",
    redact: { paths: redactPaths, censor: "[REDACTED]" },
    base: { service: serviceName() },
    ...(target ? { transport: target } : {}),
    ...options,
  });
}

export type QhseLogger = ReturnType<typeof createLogger>;
