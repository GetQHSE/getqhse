const baseUrl = import.meta.env["VITE_ADMIN_API_URL"] ?? "http://localhost:3001";

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const payload = (await response.json().catch(() => null)) as
    { message?: string; details?: unknown } | T | null;
  if (!response.ok) {
    const error = payload as { message?: string; details?: unknown } | null;
    throw new AdminApiError(response.status, error?.message ?? "Request failed", error?.details);
  }
  return payload as T;
}

export async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function formatDate(value: string | null | undefined): string {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value))
    : "—";
}
