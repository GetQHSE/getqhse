import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { llmSettings } from "@qhse/ai";
import { regulatoryEvidencePayloadIssue, staleAiEvaluationMs } from "@qhse/contracts";
import type {
  AnswerRegulatoryClarifications,
  CreateRegulatoryAction,
  CreateRegulatoryEvidence,
  DecideRegulatoryCandidate,
  DecideRegulatoryCandidates,
  PublishRegulatoryBaseline,
  RegulatoryWatch,
  StartRegulatoryAnalysis,
  UpdateRegulatoryAction,
  UpdateRegulatoryEvaluation,
  UpdateRegulatoryEvidence,
} from "@qhse/contracts";
import { createPrismaClient, Prisma, type DatabaseClient } from "@qhse/database";
import { stableCitationLabel } from "@qhse/knowledge";

import type { TenantContext } from "../../../common/request-context.js";
import { WorkQueueService } from "../../jobs/work-queue.service.js";
import {
  buildRegulatoryWatchWorkbook,
  type RegulatoryExportEntry,
} from "./regulatory-watch-exporter.js";

const watchInclude = {
  analyses: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    include: {
      scopeFacts: { orderBy: { createdAt: "asc" as const } },
      candidates: {
        orderBy: [{ changeType: "asc" as const }, { createdAt: "asc" as const }],
        include: {
          provision: {
            include: { version: { include: { document: true } } },
          },
          previousEntry: {
            include: { provision: { include: { version: { include: { document: true } } } } },
          },
        },
      },
    },
  },
  currentBaseline: {
    include: {
      entries: {
        orderBy: { orderIndex: "asc" as const },
        include: {
          provision: { include: { version: { include: { document: true } } } },
          evaluation: {
            include: {
              evidence: { orderBy: { createdAt: "asc" as const } },
              actions: {
                orderBy: { createdAt: "asc" as const },
                include: { assignee: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ProjectRegulatoryWatchInclude;

type LoadedWatch = Prisma.ProjectRegulatoryWatchGetPayload<{ include: typeof watchInclude }>;
type RegulatoryCitation = NonNullable<
  RegulatoryWatch["currentAnalysis"]
>["candidates"][number]["source"];

function canContribute(role: string): boolean {
  return ["owner", "admin", "member"].includes(role.toLowerCase());
}

function canApprove(role: string): boolean {
  return ["owner", "admin"].includes(role.toLowerCase());
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dateTime(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export function evaluationCarryForward(
  changeType: "ADDED" | "UNCHANGED" | "MODIFIED" | "REMOVAL_PROPOSED",
  previous: {
    id: string;
    result: "CONFORMING" | "PARTIAL" | "NON_CONFORMING" | "NOT_ASSESSED";
    comment: string | null;
    revision: number;
    evaluatedById: string | null;
    evaluatedAt: Date | null;
  } | null,
) {
  const unchanged = changeType === "UNCHANGED" && previous !== null;
  const modified = changeType === "MODIFIED" && previous !== null;
  return {
    carryContext: unchanged || modified,
    data: {
      previousEvaluationId: previous?.id ?? null,
      requiresReevaluation: modified,
      result: unchanged ? previous.result : ("NOT_ASSESSED" as const),
      comment: unchanged ? previous.comment : null,
      revision: unchanged ? previous.revision : 1,
      evaluatedById: unchanged ? previous.evaluatedById : null,
      evaluatedAt: unchanged ? previous.evaluatedAt : null,
    },
  };
}

function sourceFromProvision(
  provision:
    | LoadedWatch["analyses"][number]["candidates"][number]["provision"]
    | NonNullable<LoadedWatch["currentBaseline"]>["entries"][number]["provision"],
): RegulatoryCitation {
  const document = provision.version.document;
  return {
    sourceId: provision.id,
    documentId: document.id,
    revisionId: provision.version.id,
    documentTitle: document.title,
    referenceNumber: document.referenceNumber,
    revisionLabel: provision.version.versionLabel,
    sourceEdition: provision.version.sourceEdition,
    jurisdiction: document.jurisdiction,
    countryCode: document.countryCode,
    language: provision.language as "fr" | "ar",
    documentFamily: document.documentType === "standard" ? "standard" : "regulation",
    provisionType: provision.provisionType.toLowerCase() as
      "clause" | "article" | "definition" | "annex" | "table" | "note" | "section",
    provisionIdentifier: provision.sourceIdentifier,
    headingPath: provision.headingPath,
    pageStart: provision.pageStart,
    pageEnd: provision.pageEnd,
    excerpt: provision.content.slice(0, 1_200),
    citationLabel: stableCitationLabel({
      documentTitle: document.title,
      referenceNumber: document.referenceNumber,
      revisionLabel: provision.version.versionLabel,
      provisionIdentifier: provision.sourceIdentifier,
      pageStart: provision.pageStart,
      pageEnd: provision.pageEnd,
    }),
  };
}

@Injectable()
export class RegulatoryWatchService {
  private readonly database: DatabaseClient = createPrismaClient();

  constructor(@Inject(WorkQueueService) private readonly queue: WorkQueueService) {}

  private async project(tenant: TenantContext, projectIdOrSlug: string) {
    const project = await this.database.project.findFirst({
      where: {
        organizationId: tenant.organizationId,
        archivedAt: null,
        OR: [{ id: projectIdOrSlug }, { slug: projectIdOrSlug }],
      },
      include: {
        profile: {
          include: { snapshots: { orderBy: { sequence: "desc" }, take: 1 } },
        },
      },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  private async ensureWatch(tenant: TenantContext, projectIdOrSlug: string) {
    const project = await this.project(tenant, projectIdOrSlug);
    const watch = await this.database.projectRegulatoryWatch.upsert({
      where: { projectId: project.id },
      create: { organizationId: tenant.organizationId, projectId: project.id },
      update: {},
      include: watchInclude,
    });
    return { project, watch };
  }

  private async loadedWatch(tenant: TenantContext, projectIdOrSlug: string): Promise<LoadedWatch> {
    const { watch } = await this.ensureWatch(tenant, projectIdOrSlug);
    return watch;
  }

  private serialize(watch: LoadedWatch): RegulatoryWatch {
    const analysis = watch.analyses[0] ?? null;
    const visibleCandidates =
      analysis?.candidates.filter(
        (candidate) =>
          !(
            candidate.changeType === "ADDED" &&
            !candidate.requiresReview &&
            candidate.decision === "NOT_APPLICABLE"
          ),
      ) ?? [];
    const currentAnalysis = analysis
      ? {
          id: analysis.id,
          profileSnapshotId: analysis.profileSnapshotId,
          baseBaselineId: analysis.baseBaselineId,
          triggerType: analysis.triggerType,
          triggerDocumentVersionId: analysis.triggerDocumentVersionId,
          status: analysis.status,
          asOf: dateOnly(analysis.asOf),
          languages: analysis.languages.filter(
            (language): language is "fr" | "ar" => language === "fr" || language === "ar",
          ),
          phase: analysis.phase,
          progressPercent: analysis.progressPercent,
          coverage: {
            completed: analysis.completedProvisions,
            total: analysis.totalProvisions,
          },
          usage: {
            inputTokens: analysis.inputTokens,
            outputTokens: analysis.outputTokens,
            reasoningTokens: analysis.reasoningTokens,
            estimatedCostUsd: analysis.spentMicroUsd / 1_000_000,
            budgetUsd: analysis.budgetMicroUsd / 1_000_000,
          },
          clarificationRevision: analysis.clarificationRevision,
          clarifications: analysis.scopeFacts.map((fact) => ({
            key: fact.key,
            question: fact.question,
            answer: fact.answer,
          })),
          candidates: visibleCandidates.map((candidate) => ({
            id: candidate.id,
            changeType: candidate.changeType,
            changeSummary: candidate.changeSummary,
            previousEntryId: candidate.previousEntryId,
            previousSource: candidate.previousEntry
              ? sourceFromProvision(candidate.previousEntry.provision)
              : null,
            requiresReview: candidate.requiresReview,
            suggestion: candidate.suggestion,
            decision: candidate.decision,
            decisionSource: candidate.decisionSource,
            rationale: candidate.rationale,
            matchedProfileKeys: candidate.matchedProfileKeys,
            confidence: Number(candidate.confidence),
            decisionNote: candidate.decisionNote,
            reviewedAt: dateTime(candidate.reviewedAt),
            requirement: {
              text: candidate.requirementText,
              status: candidate.requirementStatus,
              supportingExcerpts: candidate.requirementSupportingExcerpts,
              issues: candidate.requirementIssues,
              source: candidate.requirementSource,
              editedAt: dateTime(candidate.requirementEditedAt),
            },
            source: sourceFromProvision(candidate.provision),
          })),
          diff: {
            added: visibleCandidates.filter((item) => item.changeType === "ADDED").length,
            unchanged: visibleCandidates.filter((item) => item.changeType === "UNCHANGED").length,
            modified: visibleCandidates.filter((item) => item.changeType === "MODIFIED").length,
            removalProposed: visibleCandidates.filter(
              (item) => item.changeType === "REMOVAL_PROPOSED",
            ).length,
            requiresReview: visibleCandidates.filter((item) => item.requiresReview).length,
          },
          error:
            analysis.errorCode || analysis.errorMessage
              ? { code: analysis.errorCode, message: analysis.errorMessage }
              : null,
          createdAt: analysis.createdAt.toISOString(),
          completedAt: dateTime(analysis.completedAt),
        }
      : null;

    const currentBaseline = watch.currentBaseline
      ? {
          id: watch.currentBaseline.id,
          sequence: watch.currentBaseline.sequence,
          profileSnapshotId: watch.currentBaseline.profileSnapshotId,
          publishedAt: watch.currentBaseline.publishedAt.toISOString(),
          entries: watch.currentBaseline.entries.map((entry) => {
            if (!entry.evaluation)
              throw new Error("Published register entry is missing evaluation");
            return {
              id: entry.id,
              previousEntryId: entry.previousEntryId,
              changeType: entry.changeType,
              orderIndex: entry.orderIndex,
              applicabilityRationale: entry.applicabilityRationale,
              requirement:
                entry.requirementText && entry.requirementSource && entry.requirementReviewedAt
                  ? {
                      text: entry.requirementText,
                      source: entry.requirementSource,
                      supportingExcerpts: entry.requirementSupportingExcerpts,
                      reviewedAt: entry.requirementReviewedAt.toISOString(),
                    }
                  : null,
              source: sourceFromProvision(entry.provision),
              evaluation: {
                id: entry.evaluation.id,
                revision: entry.evaluation.revision,
                result: entry.evaluation.result,
                comment: entry.evaluation.comment,
                evaluatedAt: dateTime(entry.evaluation.evaluatedAt),
                requiresReevaluation: entry.evaluation.requiresReevaluation,
                aiAssessment: {
                  status: entry.evaluation.aiStatus,
                  suggestedResult: entry.evaluation.aiSuggestedResult,
                  rationale: entry.evaluation.aiRationale,
                  confidence:
                    entry.evaluation.aiConfidence === null
                      ? null
                      : Number(entry.evaluation.aiConfidence),
                  matchedProfileKeys: entry.evaluation.aiMatchedProfileKeys,
                  missingInformation: entry.evaluation.aiMissingInformation,
                  remediationPlan: entry.evaluation.aiRemediationPlan,
                  action: {
                    title: entry.evaluation.aiActionTitle,
                    resources: entry.evaluation.aiActionResources,
                    startDate: entry.evaluation.aiActionStartDate
                      ? dateOnly(entry.evaluation.aiActionStartDate)
                      : null,
                    dueDate: entry.evaluation.aiActionDueDate
                      ? dateOnly(entry.evaluation.aiActionDueDate)
                      : null,
                    responsible: entry.evaluation.aiResponsible,
                    effectivenessCriteria: entry.evaluation.aiEffectivenessCriteria,
                  },
                  evaluatedAt: dateTime(entry.evaluation.aiEvaluatedAt),
                  errorMessage: entry.evaluation.aiErrorMessage,
                  updatedAt: entry.evaluation.updatedAt.toISOString(),
                },
                evidence: entry.evaluation.evidence.map((evidence) => ({
                  id: evidence.id,
                  kind: evidence.kind,
                  fileId: evidence.fileId,
                  label: evidence.label,
                  url: evidence.url,
                  note: evidence.note,
                  createdAt: evidence.createdAt.toISOString(),
                })),
                actions: entry.evaluation.actions.map((action) => ({
                  id: action.id,
                  title: action.title,
                  assigneeId: action.assigneeId,
                  assigneeName: action.assignee?.name ?? action.responsibleName ?? null,
                  resources: action.resources,
                  dueDate: action.dueDate ? dateOnly(action.dueDate) : null,
                  completedDate: action.completedDate ? dateOnly(action.completedDate) : null,
                  status: action.status,
                  effectivenessCriteria: action.effectivenessCriteria,
                  effectiveness: action.effectiveness,
                  comment: action.comment,
                })),
              },
            };
          }),
        }
      : null;

    return {
      id: watch.id,
      projectId: watch.projectId,
      status: watch.status,
      revision: watch.revision,
      currentAnalysis,
      currentBaseline,
      synchronization: {
        state:
          analysis?.status === "FAILED"
            ? "FAILED"
            : watch.status === "STALE"
              ? "STALE"
              : analysis?.status === "QUEUED"
                ? "QUEUED"
                : analysis?.status === "RUNNING" || analysis?.status === "AWAITING_CLARIFICATION"
                  ? "RUNNING"
                  : analysis?.status === "PARTIAL"
                    ? "PARTIAL"
                    : analysis?.status === "READY_FOR_REVIEW"
                      ? "CHANGES_READY"
                      : "IDLE",
        trigger: analysis?.triggerType ?? null,
        sourceBaselineId: analysis?.baseBaselineId ?? null,
        progressPercent: analysis?.progressPercent ?? 0,
        lastCheckedAt: dateTime(watch.lastCheckedAt),
        lastSuccessfulSyncAt: dateTime(watch.lastSuccessfulSyncAt),
      },
      createdAt: watch.createdAt.toISOString(),
      updatedAt: watch.updatedAt.toISOString(),
    };
  }

  async get(tenant: TenantContext, projectIdOrSlug: string): Promise<RegulatoryWatch> {
    return this.serialize(await this.loadedWatch(tenant, projectIdOrSlug));
  }

  async startAnalysis(
    tenant: TenantContext,
    projectIdOrSlug: string,
    input: StartRegulatoryAnalysis,
  ) {
    if (!canContribute(tenant.role)) throw new ForbiddenException("Regulatory access is required");
    if (!llmSettings().ragEnabled || !llmSettings().apiKey) {
      throw new ServiceUnavailableException({
        code: "REGULATORY_WORKER_UNAVAILABLE",
        message: "Regulatory analysis is not configured",
      });
    }
    await this.queue.assertWorkerAvailable("regulatory-analysis");
    const { project, watch } = await this.ensureWatch(tenant, projectIdOrSlug);
    const snapshot = project.profile?.snapshots[0];
    if (!project.profile || project.profile.status !== "COMPLETE" || !snapshot) {
      throw new BadRequestException("The project profile must be completed first");
    }
    if (
      watch.analyses[0] &&
      ["QUEUED", "RUNNING", "AWAITING_CLARIFICATION"].includes(watch.analyses[0].status)
    ) {
      throw new ConflictException("A regulatory analysis is already active");
    }
    const asOf = new Date(`${input.asOf ?? new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const run = await this.database.$transaction(async (tx) => {
      if (["READY_FOR_REVIEW", "PARTIAL"].includes(watch.analyses[0]?.status ?? "")) {
        await tx.regulatoryAnalysisRun.update({
          where: { id: watch.analyses[0]!.id },
          data: { status: "SUPERSEDED", phase: "superseded", supersededAt: new Date() },
        });
      }
      const created = await tx.regulatoryAnalysisRun.create({
        data: {
          watchId: watch.id,
          profileSnapshotId: snapshot.id,
          createdById: tenant.userId,
          baseBaselineId: watch.currentBaselineId,
          triggerType: "MANUAL",
          triggerKey: randomUUID(),
          asOf,
          languages: input.languages,
          budgetMicroUsd: Math.round(llmSettings().regulatoryRunBudgetUsd * 1_000_000),
        },
      });
      await tx.projectRegulatoryWatch.update({
        where: { id: watch.id },
        data: { status: "ANALYZING", revision: { increment: 1 } },
      });
      return created;
    });
    try {
      const queued = await this.queue.enqueue("regulatory-analysis", "analyze-regulatory-watch", {
        organizationId: tenant.organizationId,
        correlationId: randomUUID(),
        idempotencyKey: `${run.id}:0`,
        payload: { runId: run.id },
      });
      return { runId: run.id, status: run.status, ...queued };
    } catch (error) {
      await this.failRun(run.id, error);
      throw error;
    }
  }

  private async failRun(runId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "Unknown queue error";
    const run = await this.database.regulatoryAnalysisRun.update({
      where: { id: runId },
      data: { status: "FAILED", phase: "failed", errorCode: "QUEUE_ERROR", errorMessage: message },
    });
    await this.database.projectRegulatoryWatch.update({
      where: { id: run.watchId },
      data: { status: "FAILED" },
    });
  }

  async answerClarifications(
    tenant: TenantContext,
    projectIdOrSlug: string,
    runId: string,
    input: AnswerRegulatoryClarifications,
  ) {
    if (!canContribute(tenant.role)) throw new ForbiddenException("Regulatory access is required");
    const watch = await this.loadedWatch(tenant, projectIdOrSlug);
    const run = await this.database.regulatoryAnalysisRun.findFirst({
      where: { id: runId, watchId: watch.id },
      include: { scopeFacts: true },
    });
    if (!run) throw new NotFoundException("Regulatory analysis not found");
    if (run.status !== "AWAITING_CLARIFICATION") {
      throw new ConflictException("The analysis is not awaiting clarification");
    }
    if (run.clarificationRevision !== input.revision) {
      throw new ConflictException("Clarifications changed in another request");
    }
    const factsByKey = new Map(run.scopeFacts.map((fact) => [fact.key, fact]));
    const answeredKeys = new Set(input.answers.map((answer) => answer.key));
    const unansweredKeys = run.scopeFacts
      .filter((fact) => fact.answer === null)
      .map((fact) => fact.key)
      .filter((key) => !answeredKeys.has(key));
    if (unansweredKeys.length) {
      throw new BadRequestException({
        message: "Every pending clarification must be answered",
        missingKeys: unansweredKeys,
      });
    }
    for (const answer of input.answers) {
      if (!factsByKey.has(answer.key))
        throw new BadRequestException(`Unknown clarification: ${answer.key}`);
    }
    await this.database.$transaction(async (tx) => {
      for (const answer of input.answers) {
        await tx.regulatoryScopeFact.update({
          where: { runId_key: { runId, key: answer.key } },
          data: {
            answer:
              answer.answer === null ? Prisma.JsonNull : (answer.answer as Prisma.InputJsonValue),
          },
        });
      }
      await tx.regulatoryAnalysisRun.update({
        where: { id: runId },
        data: {
          status: "QUEUED",
          phase: "queued",
          progressPercent: 0,
          clarificationRevision: { increment: 1 },
        },
      });
      await tx.projectRegulatoryWatch.update({
        where: { id: watch.id },
        data: { status: "ANALYZING" },
      });
    });
    return this.queue.enqueue("regulatory-analysis", "analyze-regulatory-watch", {
      organizationId: tenant.organizationId,
      correlationId: randomUUID(),
      idempotencyKey: `${run.id}:${run.clarificationRevision + 1}`,
      payload: { runId: run.id },
    });
  }

  async decideCandidate(
    tenant: TenantContext,
    projectIdOrSlug: string,
    candidateId: string,
    input: DecideRegulatoryCandidate,
  ): Promise<RegulatoryWatch> {
    if (!canApprove(tenant.role)) throw new ForbiddenException("Regulatory approval is required");
    const watch = await this.loadedWatch(tenant, projectIdOrSlug);
    const candidate = await this.database.regulatoryApplicabilityCandidate.findFirst({
      where: {
        id: candidateId,
        requiresReview: true,
        run: { watchId: watch.id, status: { in: ["READY_FOR_REVIEW", "PARTIAL"] } },
      },
    });
    if (!candidate) throw new NotFoundException("Regulatory candidate not found");
    const requirementText =
      input.decision === "APPLICABLE"
        ? (input.requirementText ?? candidate.requirementText ?? undefined)
        : undefined;
    if (input.decision === "APPLICABLE" && !requirementText) {
      throw new BadRequestException("requirementText is required for an applicable provision");
    }
    const requirementWasEdited =
      input.decision === "APPLICABLE" &&
      input.requirementText != null &&
      input.requirementText !== candidate.requirementText;
    const reviewedAt = new Date();
    await this.database.$transaction(async (tx) => {
      const claimed = await tx.projectRegulatoryWatch.updateMany({
        where: { id: watch.id, revision: input.watchRevision },
        data: { revision: { increment: 1 } },
      });
      if (claimed.count !== 1) throw new ConflictException("Regulatory watch changed");
      await tx.regulatoryApplicabilityCandidate.update({
        where: { id: candidate.id },
        data: {
          decision: input.decision,
          decisionSource: "HUMAN",
          decisionNote: input.note ?? null,
          reviewedById: tenant.userId,
          reviewedAt,
          ...(input.decision === "APPLICABLE"
            ? {
                requirementText: requirementText as string,
                requirementStatus: "READY" as const,
                ...(requirementWasEdited
                  ? {
                      requirementSource: "HUMAN" as const,
                      requirementEditedById: tenant.userId,
                      requirementEditedAt: reviewedAt,
                    }
                  : {}),
              }
            : {}),
        },
      });
    });
    return this.get(tenant, projectIdOrSlug);
  }

  /**
   * Records every pending decision of a review in a single revision claim. Deciding candidate by
   * candidate would have the reviewer race their own requests: each decision bumps the watch
   * revision, so the second of two in-flight calls carries a stale one and loses to a conflict.
   * One claim also makes the whole batch atomic — a rejected batch leaves nothing half-decided.
   */
  async decideCandidates(
    tenant: TenantContext,
    projectIdOrSlug: string,
    input: DecideRegulatoryCandidates,
  ): Promise<RegulatoryWatch> {
    if (!canApprove(tenant.role)) throw new ForbiddenException("Regulatory approval is required");
    const watch = await this.loadedWatch(tenant, projectIdOrSlug);
    const requested = new Map(input.decisions.map((item) => [item.candidateId, item.decision]));
    if (requested.size !== input.decisions.length) {
      throw new BadRequestException("A candidate cannot be decided twice in the same request");
    }
    const candidates = await this.database.regulatoryApplicabilityCandidate.findMany({
      where: {
        id: { in: [...requested.keys()] },
        requiresReview: true,
        run: { watchId: watch.id, status: { in: ["READY_FOR_REVIEW", "PARTIAL"] } },
      },
      select: { id: true, requirementText: true },
    });
    if (candidates.length !== requested.size) {
      throw new NotFoundException("Regulatory candidate not found");
    }
    const applicable = candidates.filter(
      (candidate) => requested.get(candidate.id) === "APPLICABLE",
    );
    const notApplicable = candidates.filter(
      (candidate) => requested.get(candidate.id) === "NOT_APPLICABLE",
    );
    // Same rule as the single-candidate path: nothing becomes applicable without wording to audit.
    const withoutRequirement = applicable.filter((candidate) => !candidate.requirementText);
    if (withoutRequirement.length) {
      throw new BadRequestException({
        message: "requirementText is required for an applicable provision",
        candidateIds: withoutRequirement.map((candidate) => candidate.id),
      });
    }
    const reviewedAt = new Date();
    const shared = {
      decisionSource: "HUMAN" as const,
      decisionNote: null,
      reviewedById: tenant.userId,
      reviewedAt,
    };
    await this.database.$transaction(async (tx) => {
      const claimed = await tx.projectRegulatoryWatch.updateMany({
        where: { id: watch.id, revision: input.watchRevision },
        data: { revision: { increment: 1 } },
      });
      if (claimed.count !== 1) throw new ConflictException("Regulatory watch changed");
      if (applicable.length) {
        await tx.regulatoryApplicabilityCandidate.updateMany({
          where: { id: { in: applicable.map((candidate) => candidate.id) } },
          // The extracted wording is approved as it stands, so provenance stays with the analysis.
          data: { ...shared, decision: "APPLICABLE", requirementStatus: "READY" },
        });
      }
      if (notApplicable.length) {
        await tx.regulatoryApplicabilityCandidate.updateMany({
          where: { id: { in: notApplicable.map((candidate) => candidate.id) } },
          data: { ...shared, decision: "NOT_APPLICABLE" },
        });
      }
    });
    return this.get(tenant, projectIdOrSlug);
  }

  async startEvaluation(tenant: TenantContext, projectIdOrSlug: string) {
    if (!canContribute(tenant.role))
      throw new ForbiddenException("Regulatory contribution is required");
    const watch = await this.loadedWatch(tenant, projectIdOrSlug);
    if (!watch.currentBaselineId) throw new BadRequestException("No regulatory baseline exists");
    await this.queue.assertWorkerAvailable("regulatory-evaluation");
    // Only recommendations that never landed are retried. A COMPLETED one is a reviewer's
    // working material: re-running the baseline must not silently discard it. A RUNNING one is
    // only retried once it is stale enough that no worker can still be holding it.
    const retryable: Prisma.RegulatoryEvaluationWhereInput = {
      entry: { baselineId: watch.currentBaselineId },
      evaluatedAt: null,
      OR: [
        { aiStatus: { in: ["PENDING", "FAILED"] } },
        { aiStatus: "RUNNING", updatedAt: { lt: new Date(Date.now() - staleAiEvaluationMs) } },
      ],
    };
    await this.database.regulatoryEvaluation.updateMany({
      where: retryable,
      data: {
        aiStatus: "PENDING",
        aiSuggestedResult: null,
        aiRationale: null,
        aiConfidence: null,
        aiMatchedProfileKeys: [],
        aiMissingInformation: [],
        aiRemediationPlan: null,
        aiActionTitle: null,
        aiActionResources: null,
        aiActionStartDate: null,
        aiActionDueDate: null,
        aiResponsible: null,
        aiEffectivenessCriteria: null,
        aiEvaluatedAt: null,
        aiErrorMessage: null,
      },
    });
    try {
      return await this.queue.enqueue("regulatory-evaluation", "evaluate-regulatory-baseline", {
        organizationId: tenant.organizationId,
        correlationId: randomUUID(),
        idempotencyKey: `${watch.currentBaselineId}:evaluation:${randomUUID()}`,
        payload: { baselineId: watch.currentBaselineId },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Evaluation queue unavailable";
      // Scoped to what this call just reset, so a failed enqueue cannot mark recommendations
      // that already completed as failed.
      await this.database.regulatoryEvaluation.updateMany({
        where: {
          entry: { baselineId: watch.currentBaselineId },
          evaluatedAt: null,
          aiStatus: "PENDING",
        },
        data: { aiStatus: "FAILED", aiErrorMessage: message.slice(0, 2_000) },
      });
      throw error;
    }
  }

  async publish(
    tenant: TenantContext,
    projectIdOrSlug: string,
    input: PublishRegulatoryBaseline,
  ): Promise<RegulatoryWatch> {
    if (!canApprove(tenant.role)) throw new ForbiddenException("Regulatory approval is required");
    const watch = await this.loadedWatch(tenant, projectIdOrSlug);
    const run = await this.database.regulatoryAnalysisRun.findFirst({
      where: {
        id: input.analysisRunId,
        watchId: watch.id,
        status: { in: ["READY_FOR_REVIEW", "PARTIAL"] },
      },
      include: {
        candidates: {
          include: {
            provision: { include: { version: { include: { document: true } } } },
            previousEntry: {
              include: {
                evaluation: { include: { evidence: true, actions: true } },
              },
            },
          },
        },
      },
    });
    if (!run) throw new NotFoundException("Reviewable regulatory analysis not found");
    if (
      run.candidates.some((candidate) => candidate.requiresReview && candidate.decision === null)
    ) {
      throw new BadRequestException("Every regulatory change must be reviewed before publishing");
    }
    const applicable = run.candidates.filter((candidate) => candidate.decision === "APPLICABLE");
    if (!applicable.length)
      throw new BadRequestException("At least one provision must be applicable");
    if (
      applicable.some(
        (candidate) =>
          candidate.requirementStatus !== "READY" ||
          !candidate.requirementText ||
          !candidate.requirementSource,
      )
    ) {
      throw new BadRequestException("Every applicable provision must have an approved requirement");
    }
    const invalidRetainedRemoval = applicable.find(
      (candidate) =>
        candidate.changeType === "REMOVAL_PROPOSED" &&
        (candidate.provision.version.document.currentVersionId !==
          candidate.provision.documentVersionId ||
          (candidate.provision.version.expirationDate !== null &&
            candidate.provision.version.expirationDate <= run.asOf)),
    );
    if (invalidRetainedRemoval) {
      throw new BadRequestException(
        "A removed or expired source cannot be retained without a valid replacement",
      );
    }

    const publishedBaselineId = await this.database.$transaction(async (tx) => {
      const claimed = await tx.projectRegulatoryWatch.updateMany({
        where: {
          id: watch.id,
          revision: input.watchRevision,
          currentBaselineId: run.baseBaselineId,
        },
        data: { revision: { increment: 1 } },
      });
      if (claimed.count !== 1) throw new ConflictException("Regulatory watch changed");
      const sequence = (await tx.regulatoryBaseline.count({ where: { watchId: watch.id } })) + 1;
      const baseline = await tx.regulatoryBaseline.create({
        data: {
          watchId: watch.id,
          analysisRunId: run.id,
          profileSnapshotId: run.profileSnapshotId,
          previousBaselineId: run.baseBaselineId,
          sequence,
          publishedById: tenant.userId,
        },
      });
      for (const [index, candidate] of applicable.entries()) {
        if (!candidate.requirementText || !candidate.requirementSource) {
          throw new BadRequestException("Applicable requirement is missing");
        }
        const previousEvaluation = candidate.previousEntry?.evaluation ?? null;
        const requirementReviewedAt = candidate.reviewedAt ?? new Date();
        const entry = await tx.regulatoryRegisterEntry.create({
          data: {
            baselineId: baseline.id,
            provisionId: candidate.provisionId,
            previousEntryId: candidate.previousEntryId,
            changeType: candidate.changeType,
            orderIndex: index,
            applicabilityRationale: candidate.rationale,
            requirementText: candidate.requirementText,
            requirementSource: candidate.requirementSource,
            requirementSupportingExcerpts: candidate.requirementSupportingExcerpts,
            requirementReviewedById: candidate.reviewedById ?? tenant.userId,
            requirementReviewedAt,
            citationLabel: stableCitationLabel({
              documentTitle: candidate.provision.version.document.title,
              referenceNumber: candidate.provision.version.document.referenceNumber,
              revisionLabel: candidate.provision.version.versionLabel,
              provisionIdentifier: candidate.provision.sourceIdentifier,
              pageStart: candidate.provision.pageStart,
              pageEnd: candidate.provision.pageEnd,
            }),
          },
        });
        const carryForward = evaluationCarryForward(candidate.changeType, previousEvaluation);
        const evaluation = await tx.regulatoryEvaluation.create({
          data: {
            entryId: entry.id,
            ...carryForward.data,
          },
        });
        if (carryForward.carryContext && previousEvaluation) {
          if (previousEvaluation.evidence.length) {
            await tx.regulatoryEvaluationEvidence.createMany({
              data: previousEvaluation.evidence.map((evidence) => ({
                evaluationId: evaluation.id,
                carriedFromEvidenceId: evidence.id,
                kind: evidence.kind,
                fileId: evidence.fileId,
                label: evidence.label,
                url: evidence.url,
                note: evidence.note,
                createdById: evidence.createdById,
                createdAt: evidence.createdAt,
              })),
            });
          }
          if (previousEvaluation.actions.length) {
            await tx.regulatoryEvaluationAction.createMany({
              data: previousEvaluation.actions.map((action) => ({
                evaluationId: evaluation.id,
                carriedFromActionId: action.id,
                title: action.title,
                assigneeId: action.assigneeId,
                resources: action.resources,
                dueDate: action.dueDate,
                completedDate: action.completedDate,
                status: action.status,
                effectivenessCriteria: action.effectivenessCriteria,
                effectiveness: action.effectiveness,
                comment: action.comment,
                createdAt: action.createdAt,
                updatedAt: action.updatedAt,
              })),
            });
          }
        }
      }
      await tx.regulatoryBaseline.updateMany({
        where: { watchId: watch.id, id: { not: baseline.id }, status: "PUBLISHED" },
        data: { status: "SUPERSEDED" },
      });
      const now = new Date();
      await tx.projectRegulatoryWatch.update({
        where: { id: watch.id },
        data: {
          currentBaselineId: baseline.id,
          status: "ACTIVE",
          lastCheckedAt: now,
          lastSuccessfulSyncAt: now,
        },
      });
      await tx.regulatoryAnalysisRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          phase: "completed",
          progressPercent: 100,
          completedAt: now,
        },
      });
      return baseline.id;
    });
    try {
      await this.queue.assertWorkerAvailable("regulatory-evaluation");
      await this.queue.enqueue("regulatory-evaluation", "evaluate-regulatory-baseline", {
        organizationId: tenant.organizationId,
        correlationId: randomUUID(),
        idempotencyKey: `${publishedBaselineId}:initial-evaluation`,
        payload: { baselineId: publishedBaselineId },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Evaluation queue unavailable";
      await this.database.regulatoryEvaluation.updateMany({
        where: {
          entry: { baselineId: publishedBaselineId },
          evaluatedAt: null,
          aiStatus: "PENDING",
        },
        data: { aiStatus: "FAILED", aiErrorMessage: message.slice(0, 2_000) },
      });
    }
    return this.get(tenant, projectIdOrSlug);
  }

  private async currentEvaluation(
    tenant: TenantContext,
    projectIdOrSlug: string,
    evaluationId: string,
  ) {
    const watch = await this.loadedWatch(tenant, projectIdOrSlug);
    const evaluation = await this.database.regulatoryEvaluation.findFirst({
      where: {
        id: evaluationId,
        entry: { baselineId: watch.currentBaselineId ?? "missing" },
      },
    });
    if (!evaluation) throw new NotFoundException("Regulatory evaluation not found");
    return evaluation;
  }

  private async assertAssignee(tenant: TenantContext, assigneeId: string | null | undefined) {
    if (!assigneeId) return;
    const member = await this.database.member.findFirst({
      where: {
        organizationId: tenant.organizationId,
        userId: assigneeId,
        status: "active",
      },
      select: { id: true },
    });
    if (!member)
      throw new BadRequestException("Action assignee is not an active organization member");
  }

  async updateEvaluation(
    tenant: TenantContext,
    projectIdOrSlug: string,
    evaluationId: string,
    input: UpdateRegulatoryEvaluation,
  ): Promise<RegulatoryWatch> {
    if (!canContribute(tenant.role))
      throw new ForbiddenException("Regulatory contribution is required");
    await this.currentEvaluation(tenant, projectIdOrSlug, evaluationId);
    const claimed = await this.database.regulatoryEvaluation.updateMany({
      where: { id: evaluationId, revision: input.revision },
      data: {
        result: input.result,
        comment: input.comment ?? null,
        evaluatedById: tenant.userId,
        evaluatedAt: input.result === "NOT_ASSESSED" ? null : new Date(),
        requiresReevaluation: input.result === "NOT_ASSESSED",
        revision: { increment: 1 },
      },
    });
    if (claimed.count !== 1) throw new ConflictException("Regulatory evaluation changed");
    return this.get(tenant, projectIdOrSlug);
  }

  async addEvidence(
    tenant: TenantContext,
    projectIdOrSlug: string,
    evaluationId: string,
    input: CreateRegulatoryEvidence,
  ): Promise<RegulatoryWatch> {
    if (!canContribute(tenant.role))
      throw new ForbiddenException("Regulatory contribution is required");
    await this.currentEvaluation(tenant, projectIdOrSlug, evaluationId);
    await this.assertEvidenceFile(tenant, input.fileId);
    await this.database.regulatoryEvaluationEvidence.create({
      data: {
        evaluationId,
        kind: input.kind,
        fileId: input.fileId ?? null,
        label: input.label ?? null,
        url: input.url ?? null,
        note: input.note ?? null,
        createdById: tenant.userId,
      },
    });
    return this.get(tenant, projectIdOrSlug);
  }

  /** Scoped exactly like {@link updateAction}: only evidence hanging off the *current* baseline is
   *  reachable, so a superseded register stays immutable. */
  private async currentEvidence(
    tenant: TenantContext,
    projectIdOrSlug: string,
    evidenceId: string,
  ) {
    const watch = await this.loadedWatch(tenant, projectIdOrSlug);
    const evidence = await this.database.regulatoryEvaluationEvidence.findFirst({
      where: {
        id: evidenceId,
        evaluation: { entry: { baselineId: watch.currentBaselineId ?? "missing" } },
      },
    });
    if (!evidence) throw new NotFoundException("Regulatory evidence not found");
    return evidence;
  }

  private async assertEvidenceFile(tenant: TenantContext, fileId: string | null | undefined) {
    if (!fileId) return;
    const file = await this.database.fileObject.findFirst({
      where: {
        id: fileId,
        organizationId: tenant.organizationId,
        uploadStatus: "READY",
        deletedAt: null,
      },
    });
    if (!file) throw new BadRequestException("Evidence file is unavailable");
  }

  async updateEvidence(
    tenant: TenantContext,
    projectIdOrSlug: string,
    evidenceId: string,
    input: UpdateRegulatoryEvidence,
  ): Promise<RegulatoryWatch> {
    if (!canContribute(tenant.role))
      throw new ForbiddenException("Regulatory contribution is required");
    const evidence = await this.currentEvidence(tenant, projectIdOrSlug, evidenceId);
    if (input.fileId !== undefined) await this.assertEvidenceFile(tenant, input.fileId);
    // `kind` may be absent from the patch, so the payload rule can only be checked once the patch
    // is merged with what is stored.
    const merged = {
      kind: input.kind ?? evidence.kind,
      fileId: input.fileId !== undefined ? input.fileId : evidence.fileId,
      url: input.url !== undefined ? input.url : evidence.url,
      note: input.note !== undefined ? input.note : evidence.note,
    };
    const issue = regulatoryEvidencePayloadIssue(merged);
    if (issue) throw new BadRequestException({ [issue.path]: [issue.message] });
    await this.database.regulatoryEvaluationEvidence.update({
      where: { id: evidence.id },
      data: {
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.fileId !== undefined ? { fileId: input.fileId } : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
    });
    return this.get(tenant, projectIdOrSlug);
  }

  async deleteEvidence(
    tenant: TenantContext,
    projectIdOrSlug: string,
    evidenceId: string,
  ): Promise<RegulatoryWatch> {
    if (!canContribute(tenant.role))
      throw new ForbiddenException("Regulatory contribution is required");
    const evidence = await this.currentEvidence(tenant, projectIdOrSlug, evidenceId);
    await this.database.regulatoryEvaluationEvidence.delete({ where: { id: evidence.id } });
    return this.get(tenant, projectIdOrSlug);
  }

  async addAction(
    tenant: TenantContext,
    projectIdOrSlug: string,
    evaluationId: string,
    input: CreateRegulatoryAction,
  ): Promise<RegulatoryWatch> {
    if (!canContribute(tenant.role))
      throw new ForbiddenException("Regulatory contribution is required");
    await this.currentEvaluation(tenant, projectIdOrSlug, evaluationId);
    await this.assertAssignee(tenant, input.assigneeId);
    await this.database.regulatoryEvaluationAction.create({
      data: {
        evaluationId,
        title: input.title,
        assigneeId: input.assigneeId ?? null,
        responsibleName: input.responsibleName ?? null,
        resources: input.resources ?? null,
        dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null,
        completedDate: input.completedDate
          ? new Date(`${input.completedDate}T00:00:00.000Z`)
          : null,
        status: input.status,
        effectivenessCriteria: input.effectivenessCriteria ?? null,
        effectiveness: input.effectiveness,
        comment: input.comment ?? null,
      },
    });
    return this.get(tenant, projectIdOrSlug);
  }

  async updateAction(
    tenant: TenantContext,
    projectIdOrSlug: string,
    actionId: string,
    input: UpdateRegulatoryAction,
  ): Promise<RegulatoryWatch> {
    if (!canContribute(tenant.role))
      throw new ForbiddenException("Regulatory contribution is required");
    const watch = await this.loadedWatch(tenant, projectIdOrSlug);
    const action = await this.database.regulatoryEvaluationAction.findFirst({
      where: {
        id: actionId,
        evaluation: { entry: { baselineId: watch.currentBaselineId ?? "missing" } },
      },
    });
    if (!action) throw new NotFoundException("Regulatory action not found");
    await this.assertAssignee(tenant, input.assigneeId);
    await this.database.regulatoryEvaluationAction.update({
      where: { id: action.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        ...(input.responsibleName !== undefined ? { responsibleName: input.responsibleName } : {}),
        ...(input.resources !== undefined ? { resources: input.resources } : {}),
        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null }
          : {}),
        ...(input.completedDate !== undefined
          ? {
              completedDate: input.completedDate
                ? new Date(`${input.completedDate}T00:00:00.000Z`)
                : null,
            }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.effectivenessCriteria !== undefined
          ? { effectivenessCriteria: input.effectivenessCriteria }
          : {}),
        ...(input.effectiveness !== undefined ? { effectiveness: input.effectiveness } : {}),
        ...(input.comment !== undefined ? { comment: input.comment } : {}),
      },
    });
    return this.get(tenant, projectIdOrSlug);
  }

  async exportWorkbook(tenant: TenantContext, projectIdOrSlug: string): Promise<Buffer> {
    const watch = await this.loadedWatch(tenant, projectIdOrSlug);
    if (!watch.currentBaseline) throw new BadRequestException("No published regulatory register");
    const blocked = watch.currentBaseline.entries.find(
      (entry) => !entry.provision.version.exportAllowed,
    );
    if (blocked) throw new ForbiddenException("A normative source does not permit export");
    const legacyEntry = watch.currentBaseline.entries.find((entry) => !entry.requirementText);
    if (legacyEntry) {
      throw new BadRequestException(
        "Exigence à régénérer: relancez l’analyse et publiez la nouvelle veille avant l’export XLSX",
      );
    }
    const entries: RegulatoryExportEntry[] = watch.currentBaseline.entries.map((entry) => {
      if (!entry.evaluation) throw new Error("Published register entry is missing evaluation");
      const document = entry.provision.version.document;
      return {
        documentLabel: [document.referenceNumber, document.title].filter(Boolean).join(" — "),
        provisionIdentifier: entry.provision.sourceIdentifier ?? "Section",
        sourceText: entry.provision.content,
        requirement: entry.requirementText ?? "",
        result: entry.evaluation.result,
        aiRationale: entry.evaluation.aiRationale,
        aiRemediationPlan: entry.evaluation.aiRemediationPlan,
        evidence: entry.evaluation.evidence.map(
          (evidence) =>
            evidence.label ?? evidence.note ?? evidence.url ?? evidence.fileId ?? "Preuve",
        ),
        comment: entry.evaluation.comment,
        actions: entry.evaluation.actions.map((action) => ({
          title: action.title,
          assignee: action.assignee?.name ?? action.responsibleName ?? null,
          resources: action.resources,
          dueDate: action.dueDate ? dateOnly(action.dueDate) : null,
          completedDate: action.completedDate ? dateOnly(action.completedDate) : null,
          effectivenessCriteria: action.effectivenessCriteria,
          effectiveness: action.effectiveness,
          comment: action.comment,
        })),
      };
    });
    return buildRegulatoryWatchWorkbook(entries);
  }
}
