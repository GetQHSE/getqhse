import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { Job } from "bullmq";
import { Queue } from "bullmq";
import type { EmailType, JobEnvelope } from "@qhse/contracts";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";
import {
  BrevoProviderError,
  BrevoTransactionalEmailProvider,
  createEmailDelivery,
  EMAIL_SETTINGS_ROW_ID,
  resolveBrevoApiKey,
} from "@qhse/notifications";

import { queueNames } from "../queues.js";

const redisUrl = new URL(process.env["REDIS_URL"] ?? "redis://localhost:6379");
const appOrigin = () => (process.env["APP_ORIGIN"] ?? "http://localhost:5173").replace(/\/+$/, "");

export function emailRetryDecision(attempts: number, retryable: boolean, now = Date.now()) {
  const shouldRetry = retryable && attempts < 5;
  const delayMinutes = Math.min(2 ** Math.max(attempts - 1, 0), 60);
  return {
    status: shouldRetry ? ("PENDING" as const) : ("FAILED" as const),
    nextAttemptAt: shouldRetry ? new Date(now + delayMinutes * 60_000) : new Date(now),
  };
}

export function calendarDaysInTimeZone(now: Date, due: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const organizationToday = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
  );
  const dueCalendarDate = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return Math.round((dueCalendarDate - organizationToday) / 86_400_000);
}

export function regulatoryEmailTypesForRun(status: string, triggerType: string): EmailType[] {
  if (status === "AWAITING_CLARIFICATION") return ["REGULATORY_CLARIFICATION_REQUIRED"];
  if (status === "FAILED") return ["REGULATORY_ANALYSIS_FAILED"];
  if (status !== "READY_FOR_REVIEW" && status !== "PARTIAL") return [];
  return [
    "REGULATORY_REVIEW_READY",
    ...(triggerType === "DOCUMENT_REVISION" ? ["REGULATORY_IMPACT" as const] : []),
  ];
}

@Processor(queueNames.notifications, { concurrency: 8 })
export class EmailDeliveryProcessor extends WorkerHost {
  private readonly database: DatabaseClient = createPrismaClient();

  async process(job: Job<JobEnvelope>) {
    const deliveryId = job.data.payload["emailDeliveryId"];
    if (typeof deliveryId !== "string") throw new Error("emailDeliveryId is required");
    const claimed = await this.database.emailDelivery.updateMany({
      where: { id: deliveryId, status: "PENDING", nextAttemptAt: { lte: new Date() } },
      data: { status: "PROCESSING", attempts: { increment: 1 }, lastError: null },
    });
    if (!claimed.count) return { processed: false, reason: "not_pending" };
    const delivery = await this.database.emailDelivery.findUnique({
      where: { id: deliveryId },
      include: { invitation: { select: { status: true, expiresAt: true } } },
    });
    if (!delivery) return { processed: false, reason: "missing" };
    if (
      delivery.invitation &&
      (delivery.invitation.status !== "pending" || delivery.invitation.expiresAt <= new Date())
    ) {
      await this.database.emailDelivery.update({
        where: { id: delivery.id },
        data: { status: "CANCELLED", lastError: "Invitation is no longer pending" },
      });
      return { processed: false, reason: "invitation_not_pending" };
    }
    const settings = await this.database.emailSetting.findUnique({
      where: { id: EMAIL_SETTINGS_ROW_ID },
    });
    const key = resolveBrevoApiKey(settings).value;
    if (!key) {
      await this.fail(delivery.id, delivery.attempts, "The Brevo API key is not configured", false);
      return { processed: false, reason: "not_configured" };
    }
    try {
      const sent = await new BrevoTransactionalEmailProvider(key).send({
        templateId: delivery.templateId,
        recipient: { email: delivery.recipientEmail, name: delivery.recipientName },
        parameters: delivery.parameters as Record<string, unknown>,
        idempotencyKey: delivery.id,
      });
      await this.database.emailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          brevoMessageId: sent.messageId,
          lastError: null,
        },
      });
      return { processed: true, messageId: sent.messageId };
    } catch (error) {
      const retryable = error instanceof BrevoProviderError && error.retryable;
      const message =
        error instanceof Error ? error.message.slice(0, 1_000) : "Brevo delivery failed";
      await this.fail(delivery.id, delivery.attempts, message, retryable);
      return { processed: false, retryable };
    }
  }

  private fail(id: string, attempts: number, message: string, retryable: boolean) {
    const decision = emailRetryDecision(attempts, retryable);
    return this.database.emailDelivery.update({
      where: { id },
      data: {
        status: decision.status,
        lastError: message,
        nextAttemptAt: decision.nextAttemptAt,
      },
    });
  }
}

@Injectable()
export class EmailOutboxReconciler implements OnModuleInit, OnModuleDestroy {
  private readonly database: DatabaseClient = createPrismaClient();
  private readonly queue = new Queue<JobEnvelope>(queueNames.notifications, {
    connection: {
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      ...(redisUrl.password ? { password: redisUrl.password } : {}),
    },
  });
  private reconcileTimer?: ReturnType<typeof setInterval>;
  private eventTimer?: ReturnType<typeof setInterval>;

  onModuleInit() {
    void this.reconcile();
    void this.createRegulatoryDeliveries();
    this.reconcileTimer = setInterval(() => void this.reconcile(), 15_000);
    this.eventTimer = setInterval(() => void this.createRegulatoryDeliveries(), 60 * 60_000);
    this.reconcileTimer.unref();
    this.eventTimer.unref();
  }

  async onModuleDestroy() {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    if (this.eventTimer) clearInterval(this.eventTimer);
    await Promise.allSettled([this.queue.close(), this.database.$disconnect()]);
  }

  async reconcile() {
    await this.database.emailDelivery.updateMany({
      where: { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
      data: {
        status: "PENDING",
        nextAttemptAt: new Date(),
        lastError: "Recovered stale processing claim",
      },
    });
    const pending = await this.database.emailDelivery.findMany({
      where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
      select: { id: true, organizationId: true, attempts: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    await Promise.all(
      pending.map((delivery) =>
        this.queue.add(
          "send-transactional-email",
          {
            organizationId: delivery.organizationId,
            correlationId: delivery.id,
            idempotencyKey: `${delivery.id}:${delivery.attempts}`,
            payload: { emailDeliveryId: delivery.id },
          },
          {
            jobId: `${delivery.id}-${delivery.attempts}`,
            removeOnComplete: true,
            removeOnFail: { age: 86_400 },
          },
        ),
      ),
    );
  }

  async createRegulatoryDeliveries() {
    await Promise.all([this.createRunDeliveries(), this.createDeadlineDeliveries()]);
    await this.reconcile();
  }

  private async createRunDeliveries() {
    const runs = await this.database.regulatoryAnalysisRun.findMany({
      where: {
        status: { in: ["AWAITING_CLARIFICATION", "READY_FOR_REVIEW", "PARTIAL", "FAILED"] },
      },
      include: {
        watch: { include: { organization: true, project: true } },
        triggerDocumentVersion: { include: { document: true } },
        _count: { select: { candidates: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    for (const run of runs) {
      const admins = await this.adminRecipients(run.watch.organizationId);
      const url = `${appOrigin()}/projects/${encodeURIComponent(run.watch.project.slug)}/regulatory-watch`;
      const types = regulatoryEmailTypesForRun(run.status, run.triggerType);
      for (const type of types) {
        for (const recipient of admins) {
          const common = {
            recipientName: recipient.user.name,
            organizationName: run.watch.organization.name,
            projectName: run.watch.project.name,
            actionUrl: url,
          };
          const parameters =
            type === "REGULATORY_CLARIFICATION_REQUIRED"
              ? { ...common, analysisId: run.id }
              : type === "REGULATORY_REVIEW_READY"
                ? { ...common, analysisId: run.id, candidateCount: run._count.candidates }
                : type === "REGULATORY_IMPACT"
                  ? {
                      ...common,
                      documentReference: run.triggerDocumentVersion?.document.referenceNumber ?? "",
                      documentTitle: run.triggerDocumentVersion?.document.title ?? "",
                    }
                  : {
                      ...common,
                      analysisId: run.id,
                      errorSummary: "The regulatory analysis could not be completed.",
                    };
          await createEmailDelivery(this.database, {
            organizationId: run.watch.organizationId,
            recipientUserId: recipient.userId,
            recipientEmail: recipient.user.email,
            recipientName: recipient.user.name,
            type,
            eventKey: `regulatory-run:${run.id}:${type}`,
            entityType: "RegulatoryAnalysisRun",
            entityId: run.id,
            parameters,
          });
        }
      }
    }
  }

  private async createDeadlineDeliveries() {
    const today = new Date();
    const actions = await this.database.regulatoryEvaluationAction.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        dueDate: { not: null, lte: new Date(today.getTime() + 8 * 86_400_000) },
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        evaluation: {
          include: {
            entry: {
              include: {
                baseline: {
                  include: { watch: { include: { organization: true, project: true } } },
                },
              },
            },
          },
        },
      },
      take: 500,
    });
    for (const action of actions) {
      if (!action.dueDate) continue;
      const watch = action.evaluation.entry.baseline.watch;
      const days = calendarDaysInTimeZone(today, action.dueDate, watch.organization.timezone);
      if (days > 7) continue;
      const overdue = days <= 0;
      const type: EmailType = overdue ? "REGULATORY_ACTION_OVERDUE" : "REGULATORY_ACTION_DUE_SOON";
      const bucket = overdue ? Math.floor(Math.abs(days) / 7) : 0;
      const admins = await this.adminRecipients(watch.organizationId);
      const recipients = new Map(
        admins.map((member) => [member.user.email.toLowerCase(), member.user]),
      );
      if (action.assignee) recipients.set(action.assignee.email.toLowerCase(), action.assignee);
      for (const recipient of recipients.values()) {
        const common = {
          recipientName: recipient.name,
          organizationName: watch.organization.name,
          projectName: watch.project.name,
          actionUrl: `${appOrigin()}/projects/${encodeURIComponent(watch.project.slug)}/regulatory-watch`,
          actionTitle: action.title,
          responsibleName: action.responsibleName ?? action.assignee?.name ?? "",
          dueDate: action.dueDate.toISOString().slice(0, 10),
        };
        await createEmailDelivery(this.database, {
          organizationId: watch.organizationId,
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          type,
          eventKey: `regulatory-action:${action.id}:${type}:${bucket}`,
          entityType: "RegulatoryEvaluationAction",
          entityId: action.id,
          parameters: overdue
            ? { ...common, daysOverdue: Math.abs(days) }
            : { ...common, daysRemaining: days },
        });
      }
    }
  }

  private adminRecipients(organizationId: string) {
    return this.database.member.findMany({
      where: { organizationId, status: "active", role: { in: ["owner", "admin"] } },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }
}
