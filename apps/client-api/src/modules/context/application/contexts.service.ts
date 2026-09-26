import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type {
  AddContextIssueEvidence,
  ApplyContextIssueOverride,
  ContextAnalysisMethod,
  ContextAnalysisRunKind,
  ContextAnalysisRunSummary,
  ContextAnswerAssistRequest,
  ContextAnswerAssistResponse,
  ContextExternalFactor,
  ContextExternalRunSummary,
  ContextInternalInput,
  ContextIssue,
  CreateManualContextIssue,
  ContextScope,
  ProjectContextSettings,
  SaveContextInternalInputs,
  UpsertContextInternalInput,
} from "@qhse/contracts";
import { toSupportedLanguage } from "@qhse/contracts";
import { contextActivitySummary, contextScopeCountries } from "@qhse/ai";
import { createPrismaClient, Prisma, type DatabaseClient } from "@qhse/database";

import type { TenantContext } from "../../../common/request-context.js";
import { WorkQueueService } from "../../jobs/work-queue.service.js";
import { ContextAnswerAssistModelPort } from "./context-answer-assist-model.port.js";
import { buildContextDocument, contextDocumentFileName } from "./context-document.js";
import { buildContextRegisterWorkbook } from "./context-exporter.js";

/** As in the template, both methods are selected until the user unselects one. */
const DEFAULT_ANALYSIS_METHODS: ContextAnalysisMethod[] = ["SWOT", "PESTEL"];

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
    @Inject(ContextAnswerAssistModelPort)
    private readonly answerAssist: ContextAnswerAssistModelPort,
    @Optional() database?: DatabaseClient,
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
    return {
      projectId: project.id,
      analysisMethods: orderedMethods(settings?.analysisMethods ?? DEFAULT_ANALYSIS_METHODS),
    };
  }

  /**
   * Selecting SWOT and/or PESTEL never launches anything. Results produced with
   * another selection are no longer shown (tab 2 "clears" them), but they stay stored.
   */
  async setMethods(
    tenant: TenantContext,
    projectIdOrSlug: string,
    methods: ContextAnalysisMethod[],
  ): Promise<ProjectContextSettings> {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    const analysisMethods = orderedMethods(methods);
    await this.database.projectContextSettings.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, analysisMethods, updatedById: tenant.userId },
      update: { analysisMethods, updatedById: tenant.userId },
    });
    return { projectId: project.id, analysisMethods };
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

  /** The foundation's step-1 form: all answers upserted at once, as a draft
   * or as completed ("Continuer"), which is what unlocks steps 2 and 3. */
  async saveInternalInputs(
    tenant: TenantContext,
    projectIdOrSlug: string,
    input: SaveContextInternalInputs,
  ): Promise<ContextInternalInput[]> {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    await this.database.$transaction(
      input.answers.map((answer) =>
        this.database.contextInternalInput.upsert({
          where: {
            projectId_questionKey: { projectId: project.id, questionKey: answer.questionKey },
          },
          create: {
            projectId: project.id,
            sectionKey: answer.sectionKey,
            questionKey: answer.questionKey,
            questionLabel: answer.questionLabel,
            answerText: answer.answerText.trim(),
            status: input.status,
            createdById: tenant.userId,
            updatedById: tenant.userId,
          },
          update: {
            sectionKey: answer.sectionKey,
            questionLabel: answer.questionLabel,
            answerText: answer.answerText.trim(),
            status: input.status,
            updatedById: tenant.userId,
          },
        }),
      ),
    );
    return this.listInternalInputs(tenant, project.id);
  }

  /** Scope rows shown above step 2 — same sources as the model's digest. */
  async getScope(tenant: TenantContext, projectIdOrSlug: string): Promise<ContextScope> {
    const { id } = await this.loadProject(tenant, projectIdOrSlug);
    const project = await this.database.project.findUniqueOrThrow({
      where: { id },
      include: {
        organization: true,
        activities: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        profile: { include: { snapshots: { orderBy: { sequence: "desc" }, take: 1 } } },
      },
    });
    const snapshot = (project.profile?.snapshots[0]?.data ?? {}) as {
      fields?: Record<string, unknown>;
    };
    const digestInput = {
      project: {
        name: project.name,
        entityType: project.entityType,
        description: project.description,
        standardCode: project.standardCode,
        countryCode: project.countryCode,
        organizationName: project.organization.name,
        activities: project.activities.map((activity) => activity.name),
      },
      profileFields: snapshot.fields ?? {},
      internalInputs: [],
      registerEntries: [],
    };
    return {
      projectName: project.name,
      organizationName: project.organization.name,
      isoStandard: project.standardCode,
      activity: contextActivitySummary(digestInput),
      countries: contextScopeCountries(digestInput),
    };
  }

  /**
   * Step 1 answer assistance, direct port of the foundation's profiling
   * answer-validation engine narrowed to one already-declared internal-
   * context question. Judges only whether the message is enough to answer
   * THIS question — never decides the answer, never invents a company fact,
   * never determines applicability. The exchange is not persisted: only the
   * caller, once `valid` comes back true, saves `structuredAnswer` through
   * upsertInternalInput. A model failure surfaces as a clean 503 rather than
   * a fabricated verdict.
   */
  async assistInternalInputAnswer(
    tenant: TenantContext,
    projectIdOrSlug: string,
    input: ContextAnswerAssistRequest,
  ): Promise<ContextAnswerAssistResponse> {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    const existing = await this.database.contextInternalInput.findUnique({
      where: { projectId_questionKey: { projectId: project.id, questionKey: input.questionKey } },
    });

    try {
      return await this.answerAssist.assess({
        sectionTitle: input.sectionKey,
        questionLabel: input.questionLabel,
        savedAnswer: existing?.answerText.trim() || null,
        history: input.history,
        message: input.message,
        language: toSupportedLanguage(project.language),
      });
    } catch {
      throw new BadRequestException(
        "L'assistant n'a pas pu analyser la réponse. Réessayez, ou enregistrez votre réponse telle quelle.",
      );
    }
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
      analysisMethods: summaryMethods(run.summary),
    }));
  }

  /** Factors of the latest COMPLETED external run (what step 2 displays). */
  async listExternalFactors(
    tenant: TenantContext,
    projectIdOrSlug: string,
  ): Promise<ContextExternalFactor[]> {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    return this.latestExternalFactors(project.id);
  }

  private async latestExternalFactors(projectId: string): Promise<ContextExternalFactor[]> {
    const externalRun = await this.database.contextExternalResearchRun.findFirst({
      where: { projectId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
    });
    if (!externalRun) return [];
    const factors = await this.database.contextExternalFactor.findMany({
      where: { runId: externalRun.id },
      include: { sources: true },
      orderBy: { generatedAt: "asc" },
    });
    return factors.map(toFactorContract);
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
    return runs.map(toRunSummary);
  }

  /** Tab 1: deduces the internal issues (forces / faiblesses) from the declared context. */
  async triggerInternalIssues(tenant: TenantContext, projectIdOrSlug: string) {
    return this.triggerAnalysisRun(tenant, projectIdOrSlug, "INTERNAL");
  }

  /** Tab 3: evaluates the retained internal issues and the external ones. */
  async triggerSynthesis(tenant: TenantContext, projectIdOrSlug: string) {
    return this.triggerAnalysisRun(tenant, projectIdOrSlug, "SYNTHESIS");
  }

  /** Creates a DRAFT run and hands it to the worker; no analysis happens here. */
  private async triggerAnalysisRun(
    tenant: TenantContext,
    projectIdOrSlug: string,
    kind: ContextAnalysisRunKind,
  ) {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    const run = await this.database.contextAnalysisRun.create({
      data: { projectId: project.id, kind, status: "DRAFT", triggeredById: tenant.userId },
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

  /** Tab 3: the latest completed synthesis's issues, or none yet. */
  async listIssues(tenant: TenantContext, projectIdOrSlug: string): Promise<ContextIssue[]> {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    return this.latestIssues(project.id, "SYNTHESIS");
  }

  /** Tab 1: the latest completed deduction of internal issues, or none yet. */
  async listInternalIssues(
    tenant: TenantContext,
    projectIdOrSlug: string,
  ): Promise<ContextIssue[]> {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    return this.latestIssues(project.id, "INTERNAL");
  }

  private latestRun(projectId: string, kind: ContextAnalysisRunKind) {
    return this.database.contextAnalysisRun.findFirst({
      where: { projectId, kind, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
    });
  }

  private async latestIssues(projectId: string, kind: ContextAnalysisRunKind) {
    const run = await this.latestRun(projectId, kind);
    if (!run) return [];
    const issues = await this.database.contextIssue.findMany({
      where: { runId: run.id },
      include: { evidence: true, corrections: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    return issues.map(toIssueContract);
  }

  /**
   * "Valider la synthèse": every issue of the latest synthesis still under
   * review is validated (one audited correction each), and the run is marked
   * validated, which unlocks the exports. A later change to one of its issues
   * clears that mark (see applyIssueOverride).
   */
  async validateSynthesis(
    tenant: TenantContext,
    projectIdOrSlug: string,
  ): Promise<ContextAnalysisRunSummary> {
    const project = await this.loadProject(tenant, projectIdOrSlug);
    const run = await this.latestRun(project.id, "SYNTHESIS");
    if (!run) throw new BadRequestException("no completed synthesis for this project");

    const updated = await this.database.$transaction(async (tx) => {
      const pending = await tx.contextIssue.findMany({
        where: { runId: run.id, reviewStatus: "PENDING" },
        select: { id: true },
      });
      if (pending.length > 0) {
        await tx.contextIssueCorrection.createMany({
          data: pending.map((issue) => ({
            issueId: issue.id,
            fieldName: "review_status",
            previousValue: "pending",
            newValue: "validated",
            correctionReason: "Synthèse validée par la revue humaine.",
            correctedById: tenant.userId,
          })),
        });
        await tx.contextIssue.updateMany({
          where: { id: { in: pending.map((issue) => issue.id) } },
          data: {
            reviewStatus: "VALIDATED",
            humanOverride: true,
            humanReviewedById: tenant.userId,
            humanReviewedAt: new Date(),
          },
        });
      }
      return tx.contextAnalysisRun.update({
        where: { id: run.id },
        data: { validatedAt: new Date(), validatedById: tenant.userId },
        include: { issues: true },
      });
    });
    return toRunSummary(updated);
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
      // The audit trail speaks the foundation's lowercase review statuses,
      // which is what smqContext.groupCorrections labels.
      const audit = (value: unknown) =>
        field === "review_status" && typeof value === "string" ? value.toLowerCase() : value;
      changes.push({ field, previous: audit(previous), next: audit(inputValue) });
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
      // A validated synthesis is re-opened by any change to what it states.
      if (changes.some((change) => SYNTHESIS_FIELDS.has(change.field))) {
        await tx.contextAnalysisRun.updateMany({
          where: { id: issue.runId, kind: "SYNTHESIS", validatedAt: { not: null } },
          data: { validatedAt: null, validatedById: null },
        });
      }
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
    const run = await this.latestRun(project.id, "SYNTHESIS");
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

  /* --------------------------------- export --------------------------------- */

  async exportRegisterWorkbook(
    tenant: TenantContext,
    projectIdOrSlug: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const project = await this.database.project.findFirst({
      where: {
        organizationId: tenant.organizationId,
        archivedAt: null,
        OR: [{ id: projectIdOrSlug }, { slug: projectIdOrSlug }],
      },
      include: { organization: true },
    });
    if (!project) throw new NotFoundException("Project not found");

    const settings = await this.database.projectContextSettings.findUnique({
      where: { projectId: project.id },
    });
    const methods = orderedMethods(settings?.analysisMethods ?? DEFAULT_ANALYSIS_METHODS);
    const latestRun = await this.latestRun(project.id, "SYNTHESIS");

    const issues = latestRun
      ? await this.database.contextIssue.findMany({
          where: { runId: latestRun.id },
          include: { evidence: true, corrections: { orderBy: { createdAt: "asc" } } },
          orderBy: { createdAt: "asc" },
        })
      : [];

    const factors = await this.latestExternalFactors(project.id);

    const document = buildContextDocument({
      language: toSupportedLanguage(project.language),
      organizationName: project.organization.name,
      projectName: project.name,
      isoStandard: project.standardCode,
      method: methods[0]!,
      methodExplicit: true,
      methodsPerformed: methods,
      analysisDate: latestRun?.completedAt?.toISOString() ?? null,
      factors,
      issues: issues.map(toIssueContract),
    });

    const workbook = buildContextRegisterWorkbook(document);
    const output = await workbook.xlsx.writeBuffer();
    return { buffer: Buffer.from(output), fileName: contextDocumentFileName(document, "xlsx") };
  }
}

/** Fields whose change re-opens a validated synthesis. */
const SYNTHESIS_FIELDS = new Set([
  "title",
  "description",
  "nature",
  "origin",
  "category_key",
  "category_label",
  "scores",
  "review_status",
]);

function isMethod(value: unknown): value is ContextAnalysisMethod {
  return value === "SWOT" || value === "PESTEL";
}

/** SWOT before PESTEL, each once — the order the template presents them in. */
function orderedMethods(methods: readonly ContextAnalysisMethod[]): ContextAnalysisMethod[] {
  return (["SWOT", "PESTEL"] as const).filter((method) => methods.includes(method));
}

/** The methods a run was made with; runs from the single-method era stored one. */
function summaryMethods(summary: unknown): ContextAnalysisMethod[] {
  const { analysisMethods, analysisMethod } =
    (summary as { analysisMethods?: unknown; analysisMethod?: unknown } | null) ?? {};
  if (Array.isArray(analysisMethods)) return orderedMethods(analysisMethods.filter(isMethod));
  return isMethod(analysisMethod) ? [analysisMethod] : [];
}

type RunWithIssues = Prisma.ContextAnalysisRunGetPayload<{ include: { issues: true } }>;

function toRunSummary(run: RunWithIssues): ContextAnalysisRunSummary {
  return {
    id: run.id,
    kind: run.kind,
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
    analysisMethods: summaryMethods(run.summary),
    validatedAt: run.validatedAt?.toISOString() ?? null,
  };
}

type FactorRow = Prisma.ContextExternalFactorGetPayload<{ include: { sources: true } }>;

function toFactorContract(factor: FactorRow): ContextExternalFactor {
  return {
    id: factor.id,
    runId: factor.runId,
    categoryKey: factor.categoryKey,
    categoryLabel: factor.categoryLabel,
    title: factor.title,
    description: factor.description,
    relevanceToCompany: factor.relevanceToCompany,
    influenceOnObjectives: factor.influenceOnObjectives,
    influenceOnQuality: factor.influenceOnQuality,
    influenceOnCustomerSatisfaction: factor.influenceOnCustomerSatisfaction,
    geographicScope: factor.geographicScope,
    orientation: factor.orientation,
    evidenceStrength: factor.evidenceStrength,
    confidence: factor.confidence ? Number(factor.confidence) : null,
    sourceOrigin: factor.sourceOrigin,
    regulatoryEntryId: factor.regulatoryEntryId,
    canonicalKey: factor.canonicalKey,
    comparisonStatus: factor.comparisonStatus,
    model: factor.model,
    generatedAt: factor.generatedAt.toISOString(),
    sources: factor.sources.map((source) => ({
      id: source.id,
      url: source.url,
      title: source.title,
      publisher: source.publisher,
      sourceDate: source.sourceDate?.toISOString() ?? null,
      groundingOrigin: source.groundingOrigin,
      excerpt: source.excerpt,
      authorityTier: source.authorityTier,
    })),
  };
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
