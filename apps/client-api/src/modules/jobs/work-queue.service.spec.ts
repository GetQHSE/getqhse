import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { WorkQueueService } from "./work-queue.service.js";

describe("WorkQueueService worker discovery", () => {
  function serviceWithWorkerCount(count: number) {
    const service = new WorkQueueService();
    const getWorkersCount = vi.fn().mockResolvedValue(count);
    (
      service as unknown as {
        queues: Map<string, { getWorkersCount: typeof getWorkersCount }>;
      }
    ).queues.set("regulatory-analysis", { getWorkersCount });
    return { service, getWorkersCount };
  }

  it("accepts a registered regulatory worker", async () => {
    const { service, getWorkersCount } = serviceWithWorkerCount(1);
    await expect(service.assertWorkerAvailable("regulatory-analysis")).resolves.toBeUndefined();
    expect(getWorkersCount).toHaveBeenCalledOnce();
  });

  it("returns the stable 503 code when no regulatory worker is registered", async () => {
    const { service } = serviceWithWorkerCount(0);
    const rejection = service.assertWorkerAvailable("regulatory-analysis");
    await expect(rejection).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(rejection).rejects.toMatchObject({
      response: expect.objectContaining({ code: "REGULATORY_WORKER_UNAVAILABLE" }),
    });
  });
});
