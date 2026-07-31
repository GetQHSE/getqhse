import pino, { type LoggerOptions } from "pino";

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

export function createLogger(options: LoggerOptions = {}) {
  return pino({
    level: process.env["LOG_LEVEL"] ?? "info",
    redact: { paths: redactPaths, censor: "[REDACTED]" },
    base: { service: process.env["SERVICE_NAME"] ?? "qhse-platform" },
    ...options,
  });
}

export type QhseLogger = ReturnType<typeof createLogger>;
