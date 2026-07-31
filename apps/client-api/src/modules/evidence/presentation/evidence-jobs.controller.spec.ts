import { describe, expect, it, vi } from "vitest";

import type { QhseRequest } from "../../../common/request-context.js";
import type { WorkQueueService } from "../../jobs/work-queue.service.js";
import { EvidenceJobsController } from "./evidence-jobs.controller.js";

describe("EvidenceJobsController", () => {
  it("uses tenant and correlation context from the authenticated request", async () => {
    const enqueue = vi.fn().mockResolvedValue({ jobId: "job-1" });
    const controller = new EvidenceJobsController({ enqueue } as unknown as WorkQueueService);
    const request = {
      id: "request-1",
      tenant: { organizationId: "org-session", userId: "user-1", role: "member" },
    } as QhseRequest;

    await controller.enqueueAnalysis(request, "evidence-1", "analysis-1");

    expect(enqueue).toHaveBeenCalledWith("evidence-analysis", "analyze-evidence", {
      organizationId: "org-session",
      correlationId: "request-1",
      idempotencyKey: "analysis-1",
      payload: { evidenceId: "evidence-1" },
    });
  });

  it("requires an idempotency key", () => {
    const controller = new EvidenceJobsController({
      enqueue: vi.fn(),
    } as unknown as WorkQueueService);
    expect(() => controller.enqueueAnalysis({} as QhseRequest, "evidence-1", undefined)).toThrow(
      "idempotency-key is required",
    );
  });
});
