import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import type { JobEnvelope } from "@qhse/contracts";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";
import type { Job, Queue } from "bullmq";

import { defaultJobOptions, queueNames } from "../queues.js";

const activeStatuses = [
  "QUEUED",
  "RUNNING",
  "AWAITING_CLARIFICATION",
  "PARTIAL",
  "READY_FOR_REVIEW",
] as const;

@Processor(queueNames.regulatoryImpact, { concurrency: 1 })
export class RegulatoryImpactProcessor extends WorkerHost {
  private readonly database: DatabaseClient = createPrismaClient();

  constructor(@InjectQueue(queueNames.regulatoryAnalysis) private readonly analysisQueue: Queue) {
    super();
  }

  async process(job: Job<JobEnvelope>) {
    const eventId =
      typeof job.data.payload["eventId"] === "string" ? job.data.payload["eventId"] : null;
    if (!eventId) throw new Error("Regulatory impact eventId is required");
    const event = await this.database.regulatorySyncEvent.findUnique({ where: { id: eventId } });
    if (!event || event.status === "COMPLETED")
      return { eventId, affected: event?.affectedWatchCount ?? 0 };

    await this.database.regulatorySyncEvent.update({
      where: { id: event.id },
      data: { status: "PROCESSING", attempts: { increment: 1 }, lastError: null },
    });
    try {
      const watches = await this.database.projectRegulatoryWatch.findMany({
        where: {
          currentBaseline: {
            is: {
              entries: { some: { provision: { documentVersionId: event.previousVersionId } } },
            },
          },
        },
        include: {
          project: {
            include: {
              profile: { include: { snapshots: { orderBy: { sequence: "desc" }, take: 1 } } },
            },
          },
        },
      });

      let affected = 0;
      let deferred = 0;
      for (const watch of watches) {
        const snapshot = watch.project.profile?.snapshots[0];
        if (watch.project.profile?.status !== "COMPLETE" || !snapshot) {
          await this.database.projectRegulatoryWatch.update({
            where: { id: watch.id },
            data: { status: "STALE" },
          });
          deferred += 1;
          continue;
        }
        const triggerKey = `document-version:${event.publishedVersionId}`;
        const run = await this.database.$transaction(async (tx) => {
          const existing = await tx.regulatoryAnalysisRun.findUnique({
            where: { watchId_triggerKey: { watchId: watch.id, triggerKey } },
          });
          if (existing) return existing;
          const supersededAt = new Date();
          await tx.regulatoryAnalysisRun.updateMany({
            where: { watchId: watch.id, status: { in: [...activeStatuses] } },
            data: { status: "SUPERSEDED", phase: "superseded", supersededAt },
          });
          const created = await tx.regulatoryAnalysisRun.create({
            data: {
              watchId: watch.id,
              profileSnapshotId: snapshot.id,
              createdById: event.actorUserId,
              baseBaselineId: watch.currentBaselineId,
              triggerType: "DOCUMENT_REVISION",
              triggerKey,
              triggerDocumentVersionId: event.publishedVersionId,
              asOf: new Date(new Date().toISOString().slice(0, 10)),
              languages: ["fr", "ar"],
              budgetMicroUsd: Math.round(
                Number(process.env["OPENAI_REGULATORY_RUN_BUDGET_USD"] ?? 1) * 1_000_000,
              ),
            },
          });
          await tx.projectRegulatoryWatch.update({
            where: { id: watch.id },
            data: { status: "ANALYZING", revision: { increment: 1 } },
          });
          return created;
        });
        if (run.status !== "COMPLETED") {
          await this.analysisQueue.add(
            "analyze-regulatory-watch",
            {
              organizationId: watch.organizationId,
              correlationId: event.id,
              idempotencyKey: `${run.id}:${run.clarificationRevision}`,
              payload: { runId: run.id },
            } satisfies JobEnvelope,
            { ...defaultJobOptions, jobId: `${run.id}-${run.clarificationRevision}` },
          );
        }
        affected += 1;
      }
      await this.database.regulatorySyncEvent.update({
        where: { id: event.id },
        data: {
          status: deferred > 0 ? "PENDING" : "COMPLETED",
          affectedWatchCount: affected,
          processedAt: deferred > 0 ? null : new Date(),
        },
      });
      return { eventId, affected, deferred };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown regulatory impact error";
      const terminal = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await this.database.regulatorySyncEvent.update({
        where: { id: event.id },
        data: { status: terminal ? "FAILED" : "PENDING", lastError: message.slice(0, 4_000) },
      });
      throw error;
    }
  }
}

@Injectable()
export class RegulatoryImpactDispatcher implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly database: DatabaseClient = createPrismaClient();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(@InjectQueue(queueNames.regulatoryImpact) private readonly impactQueue: Queue) {}

  onApplicationBootstrap(): void {
    void this.dispatch();
    this.timer = setInterval(() => void this.dispatch(), 30_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async dispatch(): Promise<void> {
    const pending = await this.database.regulatorySyncEvent.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    for (const event of pending) {
      await this.impactQueue.add(
        "synchronize-regulatory-impact",
        {
          organizationId: "platform",
          correlationId: event.id,
          idempotencyKey: event.id,
          payload: { eventId: event.id },
        } satisfies JobEnvelope,
        { ...defaultJobOptions, jobId: `${event.id}:${event.attempts}` },
      );
    }
  }
}
