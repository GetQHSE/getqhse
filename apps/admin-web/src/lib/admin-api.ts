import {
  ApiClientError,
  apiRequest,
  createAxiosClient,
  type ApiRequestInit,
} from "@qhse/api-client";

const baseUrl = import.meta.env["VITE_ADMIN_API_URL"] ?? "http://localhost:3001";
const adminHttp = createAxiosClient({ baseUrl });

export { ApiClientError as AdminApiError };

export async function adminApi<T>(path: string, init?: ApiRequestInit): Promise<T> {
  return apiRequest<T>(adminHttp, path, init);
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
