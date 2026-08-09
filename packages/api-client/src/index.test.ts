import type { AxiosInstance } from "axios";
import { describe, expect, it, vi } from "vitest";

import { QhseApiClient } from "./index.js";

describe("QhseApiClient project profile", () => {
  it("calls the version-controlled completion endpoint and validates its response", async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        id: "snapshot-1",
        sequence: 1,
        schemaVersion: 1,
        contentHash: "a".repeat(64),
        completenessPercent: 100,
        regulatoryReadiness: 100,
        createdAt: "2026-08-09T00:00:00.000Z",
      },
    });
    const client = new QhseApiClient({
      baseUrl: "http://localhost:3000",
      axios: { request } as unknown as AxiosInstance,
    });

    await expect(client.completeProjectProfile("atlas/projet", 4)).resolves.toMatchObject({
      id: "snapshot-1",
      sequence: 1,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/v1/projects/atlas%2Fprojet/profile/complete",
        method: "POST",
        data: JSON.stringify({ revision: 4 }),
      }),
    );
  });

  it("rejects an invalid revision before making an HTTP request", async () => {
    const request = vi.fn();
    const client = new QhseApiClient({
      baseUrl: "http://localhost:3000",
      axios: { request } as unknown as AxiosInstance,
    });
    expect(() => client.completeProjectProfile("project-1", 0)).toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
