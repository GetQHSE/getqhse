import { randomUUID } from "node:crypto";

import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddContextIssueEvidence,
  ApplyContextIssueOverride,
  ContextAnalysisMethod,
  ContextAnalysisRunSummary,
  ContextExternalRunSummary,
  ContextInternalInput,
  ContextIssue,
  CreateManualContextIssue,
  ProjectContextSettings,
  UpsertContextInternalInput,
} from "@qhse/contracts";
import { createPrismaClient, Prisma, type DatabaseClient } from "@qhse/database";
import type { TenantContext } from "../../../common/request-context.js";
import { WorkQueueService } from "../../jobs/work-queue.service.js";

/** Matches smqContext.DEFAULT_ANALYSIS_METHOD ("swot"), spelled in the
 * Prisma enum's casing. Kept local rather than derived so a project without
 * an explicit choice falls back to the same default the domain rules name. */
const DEFAULT_ANALYSIS_METHOD: ContextAnalysisMethod = "SWOT";

/**
 * "Analyse des enjeux" (ISO 9001 §4.1) application service.
 *
 * The write paths here are the direct equivalent of the foundation's audited
 * RPCs (apply_context_issue_override, create_manual_context_issue,
 * add_context_issue_user_evidence): every ContextIssue.ai_* column is
 * immutable, a human correction only ever lands through applyIssueOverride,
 * which appends a ContextIssueCorrection row per changed field — it never
 * patches the issue directly from anywhere else.
 */
@Injectable()
export class ContextsService {
  private readonly database: DatabaseClient;

  constructor(
    @Inject(WorkQueueService) private readonly queue: WorkQueueService,
    database?: DatabaseClient,
  ) {
    this.database = database ?? createPrismaClient();
  }

  private async loadProject(tenant: TenantContext, projectIdOrSlug: string) {
    const project = await this.database.project.findFirst({
      where: {
        organizationId: tenant.organizationId,
        archivedAt: null,
        OR: [{ id: projectIdOrSlug }, { slug: projectIdOrSlug }],
      },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  /* ------------------------------- settings ------------------------------ */

  async getSettings(
    tenant: TenantContext,
    projectIdOrSlug: string,
  ): Promise<ProjectContextSettings> {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    const settings = await this.database.projectContextSettings.findUnique({
      where: { projectId: project.id },
    });
    if (!settings) {
      return { projectId: project.id, analysisMethod: DEFAULT_ANALYSIS_METHOD, explicit: false };
    }
    return { projectId: project.id, analysisMethod: settings.analysisMethod, explicit: true };
  }

  async setMethod(
    tenant: TenantContext,
    projectIdOrSlug: string,
    method: ContextAnalysisMethod,
  ): Promise<ProjectContextSettings> {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    await this.database.projectContextSettings.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, analysisMethod: method, updatedById: tenant.userId },
      update: { analysisMethod: method, updatedById: tenant.userId },
    });
    return { projectId: project.id, analysisMethod: method, explicit: true };
  }

  /* -------------------------------- step 1 -------------------------------- */

  async listInternalInputs(
    tenant: TenantContext,
    projectIdOrSlug: string,
  ): Promise<ContextInternalInput[]> {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    const rows = await this.database.contextInternalInput.findMany({
      where: { projectId: project.id },
      orderBy: [{ sectionKey: "asc" }, { questionKey: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      sectionKey: row.sectionKey,
      questionKey: row.questionKey,
      questionLabel: row.questionLabel,
      answerText: row.answerText,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async upsertInternalInput(
    tenant: TenantContext,
    projectIdOrSlug: string,
    input: UpsertContextInternalInput,
  ): Promise<ContextInternalInput> {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    const row = await this.database.contextInternalInput.upsert({
      where: { projectId_questionKey: { projectId: project.id, questionKey: input.questionKey } },
      create: {
        projectId: project.id,
        sectionKey: input.sectionKey,
        questionKey: input.questionKey,
        questionLabel: input.questionLabel,
        answerText: input.answerText,
        status: input.status,
        createdById: tenant.userId,
        updatedById: tenant.userId,
      },
      update: {
        sectionKey: input.sectionKey,
        questionLabel: input.questionLabel,
        answerText: input.answerText,
        status: input.status,
        updatedById: tenant.userId,
      },
    });
    return {
      id: row.id,
      projectId: row.projectId,
      sectionKey: row.sectionKey,
      questionKey: row.questionKey,
      questionLabel: row.questionLabel,
      answerText: row.answerText,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /* -------------------------------- step 2 -------------------------------- */

  async listExternalRuns(
    tenant: TenantContext,
    projectIdOrSlug: string,
  ): Promise<ContextExternalRunSummary[]> {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    const runs = await this.database.contextExternalResearchRun.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      include: { factors: { include: { sources: true } } },
    });
    return runs.map((run) => ({
      id: run.id,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      errorMessage: run.errorMessage,
      model: run.model,
      factorsCount: run.factors.length,
      sourcesCount: run.factors.reduce((sum, factor) => sum + factor.sources.length, 0),
      searchQueries: Array.isArray(run.searchQueries) ? (run.searchQueries as string[]) : [],
      regulatoryRunId: run.regulatoryRunId,
      analysisMethod: null,
    }));
  }

  /** Creates a DRAFT run and hands it to the worker; no retrieval happens here. */
  async triggerExternalResearch(tenant: TenantContext, projectIdOrSlug: string) {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    const run = await this.database.contextExternalResearchRun.create({
      data: { projectId: project.id, status: "DRAFT", triggeredById: tenant.userId },
    });
    try {
      const queued = await this.queue.enqueue(
        "context-external-research",
        "run-context-external-research",
        {
          organizationId: tenant.organizationId,
          correlationId: randomUUID(),
          idempotencyKey: run.id,
          payload: { runId: run.id },
        },
      );
      return { runId: run.id, status: run.status, ...queued };
    } catch (error) {
      await this.failExternalRun(run.id, error);
      throw error;
    }
  }

  private async failExternalRun(runId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "Unknown queue error";
    await this.database.contextExternalResearchRun.update({
      where: { id: runId },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
  }

  /* ------------------------------- step 3/4 -------------------------------- */

  async listAnalysisRuns(
    tenant: TenantContext,
    projectIdOrSlug: string,
  ): Promise<ContextAnalysisRunSummary[]> {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    const runs = await this.database.contextAnalysisRun.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      include: { issues: true },
    });
    return runs.map((run) => ({
      id: run.id,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      errorMessage: run.errorMessage,
      issuesCount: run.issues.length,
      internalCount: run.issues.filter((issue) => issue.aiOrigin === "INTERNAL").length,
      externalCount: run.issues.filter((issue) => issue.aiOrigin === "EXTERNAL").length,
      model: null,
      methodologyVersion: run.methodologyVersion,
      analysisMethod: null,
    }));
  }

  /** Creates a DRAFT run and hands it to the worker; no synthesis happens here. */
  async triggerSynthesis(tenant: TenantContext, projectIdOrSlug: string) {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    const run = await this.database.contextAnalysisRun.create({
      data: { projectId: project.id, status: "DRAFT", triggeredById: tenant.userId },
    });
    try {
      const queued = await this.queue.enqueue("context-analysis", "run-context-analysis", {
        organizationId: tenant.organizationId,
        correlationId: randomUUID(),
        idempotencyKey: run.id,
        payload: { runId: run.id },
      });
      return { runId: run.id, status: run.status, ...queued };
    } catch (error) {
      await this.failAnalysisRun(run.id, error);
      throw error;
    }
  }

  private async failAnalysisRun(runId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "Unknown queue error";
    await this.database.contextAnalysisRun.update({
      where: { id: runId },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
  }

  /** The latest completed run's issues, or the empty register if none exists yet. */
  async listIssues(tenant: TenantContext, projectIdOrSlug: string): Promise<ContextIssue[]> {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    const latestRun = await this.database.contextAnalysisRun.findFirst({
      where: { projectId: project.id, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
    });
    if (!latestRun) return [];
    const issues = await this.database.contextIssue.findMany({
      where: { runId: latestRun.id },
      include: { evidence: true, corrections: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    return issues.map(toIssueContract);
  }

  /* ------------------------------ human review ------------------------------ */

  /**
   * Direct equivalent of apply_context_issue_override: every field is
   * compared against the CURRENT EFFECTIVE value (persisted override ??
   * immutable ai_* conclusion), and only a field that materially differs
   * produces a ContextIssueCorrection row and moves. A no-op patch writes
   * nothing at all — not even a touched updatedAt.
   */
  async applyIssueOverride(
    tenant: TenantContext,
    projectIdOrSlug: string,
    issueId: string,
    input: ApplyContextIssueOverride,
  ): Promise<ContextIssue> {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    const issue = await this.database.contextIssue.findFirst({
      where: { id: issueId, projectId: project.id },
    });
    if (!issue) throw new NotFoundException("Context issue not found");

    const current = {
      origin: issue.origin ?? issue.aiOrigin,
      categoryKey: issue.categoryKey ?? issue.aiCategoryKey,
      categoryLabel: issue.categoryLabel ?? issue.aiCategoryLabel,
      title: issue.title ?? issue.aiTitle,
      description: issue.description ?? issue.aiDescription,
      nature: issue.nature ?? issue.aiNature,
      impactQuality: issue.impactQuality ?? issue.aiImpactQuality,
      impactCustomerSatisfaction:
        issue.impactCustomerSatisfaction ?? issue.aiImpactCustomerSatisfaction,
      impactOverall: issue.impactOverall ?? issue.aiImpactOverall,
      scores: issue.scores ?? issue.aiScores,
      userSelectedPriority: issue.userSelectedPriority ?? issue.aiRecommendedPriority,
      reviewStatus: issue.reviewStatus,
    };

    type FieldChange = { field: string; previous: unknown; next: unknown };
    const changes: FieldChange[] = [];
    // Built from fields the schema already validated (applyContextIssueOverrideSchema);
    // cast once, at the single point Prisma consumes it, rather than fighting
    // Prisma.ContextIssueUpdateInput's per-field shape here.
    const patch: Record<string, unknown> = {};

    const track = <K extends keyof typeof current>(
      field: string,
      inputValue: (typeof current)[K] | undefined,
      patchKey: string,
    ) => {
      if (inputValue === undefined) return;
      const previous = current[field as keyof typeof current];
      if (jsonEquals(previous, inputValue)) return;
      changes.push({ field, previous, next: inputValue });
      patch[patchKey] = inputValue;
    };

    track("origin", input.origin, "origin");
    track("category_key", input.categoryKey, "categoryKey");
    track("category_label", input.categoryLabel, "categoryLabel");
    track("title", input.title, "title");
    track("description", input.description, "description");
    track("nature", input.nature, "nature");
    track("impact_quality", input.impactQuality, "impactQuality");
    track(
      "impact_customer_satisfaction",
      input.impactCustomerSatisfaction,
      "impactCustomerSatisfaction",
    );
    track("impact_overall", input.impactOverall, "impactOverall");
    if (input.scores !== undefined) track("scores", input.scores, "scores");
    track("user_selected_priority", input.selectedPriority, "userSelectedPriority");
    track("review_status", input.reviewStatus, "reviewStatus");

    if (changes.length === 0) {
      const fresh = await this.database.contextIssue.findFirstOrThrow({
        where: { id: issueId },
        include: { evidence: true, corrections: { orderBy: { createdAt: "asc" } } },
      });
      return toIssueContract(fresh);
    }

    const updated = await this.database.$transaction(async (tx) => {
      await tx.contextIssueCorrection.createMany({
        data: changes.map((change) => ({
          issueId,
          fieldName: change.field,
          previousValue: toJsonInput(change.previous),
          newValue: toJsonInput(change.next),
          correctionReason: input.correctionReason ?? null,
          correctedById: tenant.userId,
        })),
      });
      return tx.contextIssue.update({
        where: { id: issueId },
        data: {
          ...patch,
          humanOverride: true,
          humanReviewedById: tenant.userId,
          humanReviewedAt: new Date(),
        } as Prisma.ContextIssueUpdateInput,
        include: { evidence: true, corrections: { orderBy: { createdAt: "asc" } } },
      });
    });
    return toIssueContract(updated);
  }

  /**
   * Direct equivalent of create_manual_context_issue: requires a completed
   * run to attach to, and records the addition itself as a correction so it
   * appears in the audit trail — the issue is created already reviewed
   * (review_status validated, human_override true), never presented as an AI
   * conclusion (source_kind manual).
   */
  async createManualIssue(
    tenant: TenantContext,
    projectIdOrSlug: string,
    input: CreateManualContextIssue,
  ): Promise<ContextIssue> {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    const run = await this.database.contextAnalysisRun.findFirst({
      where: { projectId: project.id, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
    });
    if (!run) {
      throw new BadRequestException("no completed context analysis run for this project");
    }
    const fingerprint = `manual-${hashFingerprint(project.id, input.title, input.nature)}`;

    const created = await this.database.$transaction(async (tx) => {
      const issue = await tx.contextIssue.create({
        data: {
          runId: run.id,
          projectId: project.id,
          issueFingerprint: fingerprint,
          canonicalKey: input.title.trim().toLowerCase(),
          aiOrigin: input.origin,
          aiCategoryKey: input.categoryKey,
          aiCategoryLabel: input.categoryLabel,
          aiTitle: input.title.trim(),
          aiDescription: input.description.trim(),
          aiNature: input.nature,
          aiScores: {},
          aiRecommendedPriority: false,
          origin: input.origin,
          categoryKey: input.categoryKey,
          categoryLabel: input.categoryLabel,
          title: input.title.trim(),
          description: input.description.trim(),
          nature: input.nature,
          reviewStatus: "VALIDATED",
          humanOverride: true,
          humanReviewedById: tenant.userId,
          humanReviewedAt: new Date(),
          sourceKind: "MANUAL",
          createdById: tenant.userId,
        },
      });
      await tx.contextIssueCorrection.create({
        data: {
          issueId: issue.id,
          fieldName: "source_kind",
          previousValue: Prisma.JsonNull,
          newValue: "manual",
          correctionReason:
            input.reason?.trim() || "Enjeu ajouté manuellement par un membre du projet",
          correctedById: tenant.userId,
        },
      });
      return tx.contextIssue.findFirstOrThrow({
        where: { id: issue.id },
        include: { evidence: true, corrections: { orderBy: { createdAt: "asc" } } },
      });
    });
    return toIssueContract(created);
  }

  /** Direct equivalent of add_context_issue_user_evidence. */
  async addIssueEvidence(
    tenant: TenantContext,
    projectIdOrSlug: string,
    issueId: string,
    input: AddContextIssueEvidence,
  ): Promise<ContextIssue> {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    const issue = await this.database.contextIssue.findFirst({
      where: { id: issueId, projectId: project.id },
    });
    if (!issue) throw new NotFoundException("Context issue not found");

    await this.database.contextIssueEvidence.create({
      data: {
        issueId,
        sourceType: "user_input",
        originKind: "USER",
        excerpt: input.excerpt ?? null,
        metadata: input.metadata as Prisma.InputJsonValue,
        createdById: tenant.userId,
      },
    });
    const fresh = await this.database.contextIssue.findFirstOrThrow({
      where: { id: issueId },
      include: { evidence: true, corrections: { orderBy: { createdAt: "asc" } } },
    });
    return toIssueContract(fresh);
  }
}

function hashFingerprint(...parts: string[]): string {
  return parts
    .join("|")
    .toLowerCase()
    .split("")
    .reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0)
    .toString(16)
    .replace("-", "n");
}

function jsonEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === undefined || value === null ? Prisma.JsonNull : value;
}

type IssueRow = Prisma.ContextIssueGetPayload<{ include: { evidence: true; corrections: true } }>;

function toIssueContract(row: IssueRow): ContextIssue {
  return {
    id: row.id,
    runId: row.runId,
    canonicalKey: row.canonicalKey,
    comparisonStatus: row.comparisonStatus,
    aiOrigin: row.aiOrigin,
    aiCategoryKey: row.aiCategoryKey,
    aiCategoryLabel: row.aiCategoryLabel,
    aiTitle: row.aiTitle,
    aiDescription: row.aiDescription,
    aiReasoning: row.aiReasoning,
    aiNature: row.aiNature,
    aiImpactQuality: row.aiImpactQuality,
    aiImpactCustomerSatisfaction: row.aiImpactCustomerSatisfaction,
    aiImpactOverall: row.aiImpactOverall,
    aiScores: (row.aiScores ?? {}) as ContextIssue["aiScores"],
    aiConfidence: row.aiConfidence ? Number(row.aiConfidence) : null,
    aiRecommendedPriority: row.aiRecommendedPriority,
    aiModel: row.aiModel,
    aiGeneratedAt: row.aiGeneratedAt.toISOString(),
    origin: row.origin ?? row.aiOrigin,
    categoryKey: row.categoryKey ?? row.aiCategoryKey,
    categoryLabel: row.categoryLabel ?? row.aiCategoryLabel,
    title: row.title ?? row.aiTitle,
    description: row.description ?? row.aiDescription,
    nature: row.nature ?? row.aiNature,
    impactQuality: row.impactQuality ?? row.aiImpactQuality,
    impactCustomerSatisfaction: row.impactCustomerSatisfaction ?? row.aiImpactCustomerSatisfaction,
    impactOverall: row.impactOverall ?? row.aiImpactOverall,
    scores: (row.scores ?? row.aiScores ?? {}) as ContextIssue["scores"],
    selectedPriority: row.userSelectedPriority ?? row.aiRecommendedPriority,
    reviewStatus: row.reviewStatus,
    humanOverride: row.humanOverride,
    humanReviewedAt: row.humanReviewedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    sourceKind: row.sourceKind,
    createdAt: row.createdAt.toISOString(),
    evidence: row.evidence.map((item) => ({
      id: item.id,
      sourceType: item.sourceType,
      originKind: item.originKind,
      sourceUrl: item.sourceUrl,
      excerpt: item.excerpt,
      createdAt: item.createdAt.toISOString(),
    })),
    corrections: row.corrections.map((item) => ({
      id: item.id,
      fieldName: item.fieldName,
      previousValue: item.previousValue,
      newValue: item.newValue,
      correctionReason: item.correctionReason,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}
