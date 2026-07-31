import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

export const serverEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  APP_ORIGIN: z.url(),
  CORS_ORIGINS: z.string().transform((value) => value.split(",").map((item) => item.trim())),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  COOKIE_SECURE: booleanString,
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanString,
  DOCLING_URL: z.url(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10_485_760),
});

export const workerEnvironmentSchema = serverEnvironmentSchema.pick({
  NODE_ENV: true,
  DATABASE_URL: true,
  REDIS_URL: true,
  S3_ENDPOINT: true,
  S3_REGION: true,
  S3_BUCKET: true,
  S3_ACCESS_KEY: true,
  S3_SECRET_KEY: true,
  S3_FORCE_PATH_STYLE: true,
  DOCLING_URL: true,
  LOG_LEVEL: true,
});

export const adminApiEnvironmentSchema = serverEnvironmentSchema.extend({
  ADMIN_API_PORT: z.coerce.number().int().positive().default(3001),
  ADMIN_API_HOST: z.string().min(1).default("0.0.0.0"),
  ADMIN_BETTER_AUTH_URL: z.url().default("http://localhost:3001"),
  ADMIN_CORS_ORIGINS: z
    .string()
    .default("http://localhost:5174")
    .transform((value) => value.split(",").map((item) => item.trim())),
});

export const webEnvironmentSchema = z.object({
  VITE_API_URL: z.url(),
  VITE_DEFAULT_LOCALE: z.enum(["fr", "ar"]).default("fr"),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;
export type AdminApiEnvironment = z.infer<typeof adminApiEnvironmentSchema>;
export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;
