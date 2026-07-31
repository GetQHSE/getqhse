import { describe, expect, it, vi } from "vitest";

import { DocumentIngestionProcessor } from "./document-ingestion.processor.js";

describe("DocumentIngestionProcessor", () => {
  it("reports progress and preserves idempotency metadata", async () => {
    const updateProgress = vi.fn().mockResolvedValue(undefined);
    const result = await new DocumentIngestionProcessor().process({
      data: {
        organizationId: "org-1",
        correlationId: "request-1",
        idempotencyKey: "ingest:file-1",
        payload: { fileId: "file-1" },
      },
      updateProgress,
      log: vi.fn(),
    } as never);

    expect(result).toEqual({ processed: true, idempotencyKey: "ingest:file-1" });
    expect(updateProgress).toHaveBeenLastCalledWith({ phase: "completed", progress: 100 });
  });
});
