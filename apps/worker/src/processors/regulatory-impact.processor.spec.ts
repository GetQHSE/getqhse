import { beforeAll, describe, expect, it, vi } from "vitest";

import { RegulatoryImpactProcessor } from "./regulatory-impact.processor.js";

function job() {
  return {
    data: { payload: { eventId: "event-1" } },
    attemptsMade: 0,
    opts: { attempts: 5 },
  } as never;
}

const event = {
  id: "event-1",
  previousVersionId: "revision-1",
  publishedVersionId: "revision-2",
  actorUserId: "admin-1",
  status: "PENDING",
  affectedWatchCount: 0,
};

beforeAll(() => {
  process.env["DATABASE_URL"] ??= "postgresql://postgres:postgres@localhost:5432/qhse_test";
});

describe("regulatory revision impact", () => {
  it("marks incomplete projects stale without starting an unsafe analysis", async () => {
    const analysisQueue = { add: vi.fn() };
    const database = {
      regulatorySyncEvent: {
        findUnique: vi.fn().mockResolvedValue(event),
        update: vi.fn().mockResolvedValue({}),
      },
      projectRegulatoryWatch: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "watch-1",
            organizationId: "org-1",
            currentBaselineId: "baseline-1",
            project: { profile: { status: "IN_PROGRESS", snapshots: [] } },
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const processor = new RegulatoryImpactProcessor(analysisQueue as never);
    (processor as unknown as { database: object }).database = database;

    await processor.process(job());

    expect(database.projectRegulatoryWatch.update).toHaveBeenCalledWith({
      where: { id: "watch-1" },
      data: { status: "STALE" },
    });
    expect(analysisQueue.add).not.toHaveBeenCalled();
  });

  it("reuses an idempotent successor run when a pending event is retried", async () => {
    const analysisQueue = { add: vi.fn().mockResolvedValue({ id: "job-1" }) };
    const existingRun = {
      id: "run-2",
      status: "QUEUED",
      clarificationRevision: 0,
    };
    const transactionClient = {
      regulatoryAnalysisRun: {
        findUnique: vi.fn().mockResolvedValue(existingRun),
        updateMany: vi.fn(),
        create: vi.fn(),
      },
      projectRegulatoryWatch: { update: vi.fn() },
    };
    const database = {
      regulatorySyncEvent: {
        findUnique: vi.fn().mockResolvedValue(event),
        update: vi.fn().mockResolvedValue({}),
      },
      projectRegulatoryWatch: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "watch-1",
            organizationId: "org-1",
            currentBaselineId: "baseline-1",
            project: {
              profile: {
                status: "COMPLETE",
                snapshots: [{ id: "snapshot-2" }],
              },
            },
          },
        ]),
      },
      $transaction: vi.fn(async (operation: (tx: typeof transactionClient) => Promise<unknown>) =>
        operation(transactionClient),
      ),
    };
    const processor = new RegulatoryImpactProcessor(analysisQueue as never);
    (processor as unknown as { database: object }).database = database;

    await processor.process(job());

    expect(transactionClient.regulatoryAnalysisRun.findUnique).toHaveBeenCalledWith({
      where: {
        watchId_triggerKey: {
          watchId: "watch-1",
          triggerKey: "document-version:revision-2",
        },
      },
    });
    expect(transactionClient.regulatoryAnalysisRun.create).not.toHaveBeenCalled();
    expect(analysisQueue.add).toHaveBeenCalledTimes(1);
  });
});
