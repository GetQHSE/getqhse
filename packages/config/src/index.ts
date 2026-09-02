import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

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
  OPENAI_API_KEY: optionalNonEmptyString,
  OPENAI_PROFILE_MODEL: z.string().min(1).default("gpt-5-mini"),
  OPENAI_REGULATORY_MODEL: z.string().min(1).default("gpt-5-mini"),
  OPENAI_REGULATORY_TRIAGE_MODEL: z.string().min(1).default("gpt-5-nano"),
  OPENAI_REGULATORY_VERIFICATION_MODEL: z.string().min(1).default("gpt-5-nano"),
  OPENAI_REGULATORY_SERVICE_TIER: z.enum(["auto", "default", "flex", "priority"]).default("flex"),
  OPENAI_REGULATORY_TEXT_VERBOSITY: z.enum(["low", "medium", "high"]).default("low"),
  OPENAI_REGULATORY_PROMPT_CACHE_RETENTION: z.enum(["in_memory", "24h"]).default("24h"),
  OPENAI_REGULATORY_REASONING_EFFORT: z
    .enum(["none", "low", "medium", "high", "xhigh", "max"])
    .default("low"),
  OPENAI_REGULATORY_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  OPENAI_REGULATORY_DRAFT_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(12_000),
  OPENAI_REGULATORY_VERIFICATION_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .positive()
    .default(6_000),
  OPENAI_REGULATORY_RUN_BUDGET_USD: z.coerce.number().positive().default(1),
  OPENAI_REGULATORY_INPUT_USD_PER_MTOK: z.coerce.number().positive().default(0.25),
  OPENAI_REGULATORY_CACHED_INPUT_USD_PER_MTOK: z.coerce.number().positive().default(0.025),
  OPENAI_REGULATORY_OUTPUT_USD_PER_MTOK: z.coerce.number().positive().default(2),
  OPENAI_REGULATORY_FLEX_RATE_MULTIPLIER: z.coerce.number().positive().default(0.5),
  REGULATORY_CONSERVATIVE_BYTES_PER_TOKEN: z.coerce.number().positive().default(2),
  OPENAI_TRANSCRIPTION_MODEL: z.string().min(1).default("gpt-4o-mini-transcribe"),
  NORMATIVE_RAG_ENABLED: booleanString,
  WORKER_HOST: z.string().min(1).default("127.0.0.1"),
  WORKER_PORT: z.coerce.number().int().positive().default(4_002),
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
  OPENAI_API_KEY: true,
  OPENAI_REGULATORY_MODEL: true,
  OPENAI_REGULATORY_TRIAGE_MODEL: true,
  OPENAI_REGULATORY_VERIFICATION_MODEL: true,
  OPENAI_REGULATORY_SERVICE_TIER: true,
  OPENAI_REGULATORY_TEXT_VERBOSITY: true,
  OPENAI_REGULATORY_PROMPT_CACHE_RETENTION: true,
  OPENAI_REGULATORY_REASONING_EFFORT: true,
  OPENAI_REGULATORY_TIMEOUT_MS: true,
  OPENAI_REGULATORY_DRAFT_MAX_OUTPUT_TOKENS: true,
  OPENAI_REGULATORY_VERIFICATION_MAX_OUTPUT_TOKENS: true,
  OPENAI_REGULATORY_RUN_BUDGET_USD: true,
  OPENAI_REGULATORY_INPUT_USD_PER_MTOK: true,
  OPENAI_REGULATORY_CACHED_INPUT_USD_PER_MTOK: true,
  OPENAI_REGULATORY_OUTPUT_USD_PER_MTOK: true,
  OPENAI_REGULATORY_FLEX_RATE_MULTIPLIER: true,
  REGULATORY_CONSERVATIVE_BYTES_PER_TOKEN: true,
  NORMATIVE_RAG_ENABLED: true,
  WORKER_HOST: true,
  WORKER_PORT: true,
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
