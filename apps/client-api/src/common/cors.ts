const DEFAULT_CLIENT_WEB_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"] as const;

function normalizeOrigin(origin: string): string | null {
  const trimmed = origin.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export function parseCorsOrigins(value = process.env["CORS_ORIGINS"]): string[] {
  const rawOrigins = value?.split(",") ?? DEFAULT_CLIENT_WEB_ORIGINS;
  return Array.from(
    new Set(
      rawOrigins
        .map((origin) => normalizeOrigin(origin))
        .filter((origin): origin is string => Boolean(origin)),
    ),
  );
}

export const corsMethods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

export const corsAllowedHeaders = [
  "Authorization",
  "Content-Type",
  "Accept",
  "Origin",
  "X-Requested-With",
  "X-Organization-Id",
  "X-Request-Id",
] as const;
