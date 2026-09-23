import { Processor, WorkerHost } from "@nestjs/bullmq";
import {
  isProviderConfigured,
  languageModel,
  llmSettings,
  regulatoryConformityPrompt,
  snapshotLanguage,
} from "@qhse/ai";
import type { LanguageProvider } from "@qhse/config";
import { jobEnvelopeSchema, type JobEnvelope } from "@qhse/contracts";
import { Prisma, createPrismaClient, type DatabaseClient } from "@qhse/database";
import { projectCountryCodes } from "@qhse/domain";
import { createLogger } from "@qhse/observability";
import { Output, generateText } from "ai";
import type { Job } from "bullmq";
import { z } from "zod";

import { searchForPrompt } from "../knowledge-library.js";
import { queueNames } from "../queues.js";
import {
  conservativeInputTokens,
  failureUsage,
  isTimeoutError,
  regulatoryCostMicroUsd,
  regulatoryPrimaryModel,
  regulatoryPrimaryProvider,
  regulatoryProviderOptions,
  type RegulatoryTokenUsage,
} from "./regulatory-model-cost.js";

/** Ledger stage used by every model call this processor makes, so conformity spend stays
 *  separable from the applicability spend recorded against the same analysis run. */
const EVALUATION_STAGE = "conformity_evaluation";
/** A model call still marked RUNNING after this long belongs to a worker that died mid-call. */
const ABANDONED_CALL_AFTER_MS = 15 * 60_000;
/** Guards against burning the whole budget one doomed call at a time when the provider is down. */
const MAX_CONSECUTIVE_FAILURES = 5;

type ReservedModelCall = {
  id: string;
  provider: LanguageProvider;
  model: string;
  reservedMicroUsd: number;
};

class RegulatoryEvaluationBudgetError extends Error {
  constructor() {
    super("Le budget d’évaluation IA de cette baseline est épuisé");
    this.name = "RegulatoryEvaluationBudgetError";
  }
}

const conformityAssessmentSchema = z
  .object({
    suggestedResult: z.enum(["CONFORMING", "PARTIAL", "NON_CONFORMING"]),
    rationale: z.string().trim().min(10).max(4_000),
    confidence: z.number().min(0).max(1),
    matchedProfileKeys: z.array(z.string().trim().min(1).max(120)).max(20),
    missingInformation: z.array(z.string().trim().min(1).max(500)).max(20),
    remediationPlan: z.string().trim().min(20).max(4_000).nullable(),
    action: z.object({
      title: z.string().trim().min(3).max(500).nullable(),
      resources: z.string().trim().min(2).max(2_000).nullable(),
      startDate: z.iso.date().nullable(),
      dueDate: z.iso.date().nullable(),
      responsible: z.string().trim().min(2).max(300).nullable(),
      effectivenessCriteria: z.string().trim().min(3).max(2_000).nullable(),
    }),
  })
  .superRefine((value, context) => {
    if (value.suggestedResult !== "CONFORMING" && !value.remediationPlan) {
      context.addIssue({
        code: "custom",
        path: ["remediationPlan"],
        message: "A remediation plan is required for a conformity gap",
      });
    }
  });

export type GeneratedConformityAssessment = z.infer<typeof conformityAssessmentSchema>;

function explicitText(
  value: string | null,
  sourceContext: string,
  confidence: number,
): string | null {
  if (!value || confidence < 0.8) return null;
  const normalizedSource = sourceContext.toLocaleLowerCase();
  return normalizedSource.includes(value.toLocaleLowerCase()) ? value : null;
}

function explicitDate(
  value: string | null,
  sourceContext: string,
  confidence: number,
): string | null {
  if (!value || confidence < 0.8) return null;
  return sourceContext.includes(value) ? value : null;
}

export function normalizeConformityAssessment(
  assessment: GeneratedConformityAssessment,
  sourceContext: string,
) {
  const uncertain = assessment.confidence < 0.7;
  const suggestedResult = uncertain ? ("NON_CONFORMING" as const) : assessment.suggestedResult;
  const conforming = suggestedResult === "CONFORMING";
  const missingInformation =
    uncertain && assessment.missingInformation.length === 0
      ? ["Les informations disponibles ne permettent pas de démontrer la conformité."]
      : assessment.missingInformation;
  return {
    suggestedResult,
    rationale: assessment.rationale,
    confidence: assessment.confidence,
    matchedProfileKeys: assessment.matchedProfileKeys.filter((key) =>
      sourceContext.includes(`"${key}"`),
    ),
    missingInformation,
    remediationPlan: conforming
      ? null
      : (assessment.remediationPlan ??
        "Rassembler, formaliser et faire valider les informations ou preuves manquantes, puis réévaluer l’exigence."),
    action: {
      title: conforming ? null : assessment.action.title,
      resources: conforming
        ? null
        : explicitText(assessment.action.resources, sourceContext, assessment.confidence),
      startDate: conforming
        ? null
        : explicitDate(assessment.action.startDate, sourceContext, assessment.confidence),
      dueDate: conforming
        ? null
        : explicitDate(assessment.action.dueDate, sourceContext, assessment.confidence),
      responsible: conforming
        ? null
        : explicitText(assessment.action.responsible, sourceContext, assessment.confidence),
      effectivenessCriteria: conforming ? null : assessment.action.effectivenessCriteria,
    },
  };
}

@Processor(queueNames.regulatoryEvaluation, { concurrency: 2 })
export class RegulatoryEvaluationProcessor extends WorkerHost {
  private readonly database: DatabaseClient = createPrismaClient();
  private readonly logger = createLogger({ base: { service: "qhse-worker" } });

  /** Settles reservations left RUNNING by a worker that died mid-call, so their reserved
   *  amount stops counting against the budget forever. Only touches calls old enough that
   *  a concurrent job cannot still own them. Charged at 0, not the reservation: a call
   *  abandoned by a dead worker never settled, so whether it billed anything is unknown —
   *  same as a rate-limited call — and charging the full worst-case reservation on every
   *  such recovery let repeated retries burn through the budget on cost that was never
   *  actually spent. */
  private async recoverAbandonedModelCalls(runId: string): Promise<void> {
    await this.database.$executeRaw(Prisma.sql`
      UPDATE regulatory_model_calls
      SET status = 'FAILED', cost_micro_usd = 0,
        error_code = 'WORKER_RESTARTED', completed_at = NOW()
      WHERE run_id = ${runId} AND stage = ${EVALUATION_STAGE} AND status = 'RUNNING'
        AND created_at < NOW() - ${Prisma.raw(`INTERVAL '${ABANDONED_CALL_AFTER_MS} milliseconds'`)}
    `);
  }

  private async reserveModelCall(input: {
    runId: string;
    provisionId: string | null;
    attempt: number;
    provider: LanguageProvider;
    model: string;
    prompt: { system: string; context: string };
    maxOutputTokens: number;
    budgetMicroUsd: number;
  }): Promise<ReservedModelCall> {
    const reservedMicroUsd = regulatoryCostMicroUsd(
      { inputTokens: conservativeInputTokens(input.prompt), outputTokens: input.maxOutputTokens },
      input.model,
      input.provider,
    );
    const reservation = await this.database.$transaction(async (tx) => {
      // Locks the analysis run row for the transaction so two evaluation jobs on the same
      // baseline can't read the same ledger snapshot and jointly overshoot the budget.
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM regulatory_analysis_runs WHERE id = ${input.runId} FOR UPDATE`,
      );
      const [running, settled] = await Promise.all([
        tx.regulatoryModelCall.aggregate({
          where: { runId: input.runId, stage: EVALUATION_STAGE, status: "RUNNING" },
          _sum: { reservedMicroUsd: true },
        }),
        tx.regulatoryModelCall.aggregate({
          where: { runId: input.runId, stage: EVALUATION_STAGE, status: { not: "RUNNING" } },
          _sum: { costMicroUsd: true },
        }),
      ]);
      const committedMicroUsd =
        (running._sum.reservedMicroUsd ?? 0) + (settled._sum.costMicroUsd ?? 0);
      if (committedMicroUsd + reservedMicroUsd > input.budgetMicroUsd) return null;
      const call = await tx.regulatoryModelCall.create({
        data: {
          runId: input.runId,
          provisionId: input.provisionId,
          stage: EVALUATION_STAGE,
          attempt: input.attempt,
          model: input.model,
          provider: input.provider,
          reservedMicroUsd,
        },
        select: { id: true },
      });
      return { id: call.id, provider: input.provider, model: input.model, reservedMicroUsd };
    });
    if (!reservation) throw new RegulatoryEvaluationBudgetError();
    return reservation;
  }

  private async settleModelCall(
    reservation: ReservedModelCall,
    result:
      | {
          status: "SUCCEEDED";
          inputTokens: number;
          cachedInputTokens: number;
          outputTokens: number;
          reasoningTokens: number;
          latencyMs: number;
        }
      | {
          status: "FAILED" | "TIMED_OUT";
          latencyMs: number;
          errorCode: string;
          usage?: RegulatoryTokenUsage | null;
        },
  ): Promise<void> {
    const succeeded = result.status === "SUCCEEDED";
    const measured = succeeded ? result : result.usage;
    const chargedMicroUsd = measured
      ? regulatoryCostMicroUsd(measured, reservation.model, reservation.provider)
      : reservation.reservedMicroUsd;
    await this.database.regulatoryModelCall.updateMany({
      where: { id: reservation.id, status: "RUNNING" },
      data: {
        status: result.status,
        costMicroUsd: chargedMicroUsd,
        latencyMs: result.latencyMs,
        completedAt: new Date(),
        ...(succeeded
          ? {
              inputTokens: result.inputTokens,
              cachedInputTokens: result.cachedInputTokens,
              outputTokens: result.outputTokens,
              reasoningTokens: result.reasoningTokens,
            }
          : {
              errorCode: result.errorCode,
              ...(result.usage
                ? {
                    inputTokens: result.usage.inputTokens,
                    cachedInputTokens: result.usage.cachedInputTokens ?? 0,
                    outputTokens: result.usage.outputTokens,
                  }
                : {}),
            }),
      },
    });
  }

  private async failEvaluations(evaluationIds: string[], message: string): Promise<void> {
    if (!evaluationIds.length) return;
    await this.database.regulatoryEvaluation.updateMany({
      where: { id: { in: evaluationIds }, evaluatedAt: null },
      data: { aiStatus: "FAILED", aiErrorMessage: message.slice(0, 2_000) },
    });
  }

  async process(job: Job<JobEnvelope>) {
    const envelope = jobEnvelopeSchema.parse(job.data);
    const baselineId =
      typeof envelope.payload["baselineId"] === "string" ? envelope.payload["baselineId"] : null;
    if (!baselineId) throw new Error("baselineId is required");
    const provider = regulatoryPrimaryProvider();
    if (!isProviderConfigured(provider))
      throw new Error("The selected AI provider is not configured");

    const baseline = await this.database.regulatoryBaseline.findFirst({
      where: { id: baselineId, watch: { organizationId: envelope.organizationId } },
      include: {
        profileSnapshot: true,
        entries: {
          orderBy: { orderIndex: "asc" },
          include: {
            provision: { include: { version: { include: { document: true } } } },
            evaluation: {
              include: {
                evidence: { orderBy: { createdAt: "asc" } },
                actions: { select: { id: true }, take: 1 },
              },
            },
          },
        },
      },
    });
    if (!baseline) throw new Error("Regulatory baseline not found");

    // FAILED entries are deliberately excluded: a deterministic failure (unparseable output,
    // oversized prompt) would otherwise be retried on every job attempt and starve the rest of
    // the baseline. Re-running them is an explicit user action, which resets them to PENDING.
    const pending = baseline.entries.filter(
      (entry) =>
        entry.evaluation &&
        entry.evaluation.evaluatedAt === null &&
        (entry.evaluation.aiStatus === "PENDING" || entry.evaluation.aiStatus === "RUNNING"),
    );
    const model = regulatoryPrimaryModel();
    const reasoningEffort = llmSettings().regulatoryReasoningEffort;
    const maxOutputTokens = llmSettings().regulatoryVerificationMaxOutputTokens;
    const timeoutMs = llmSettings().regulatoryTimeoutMs;
    const budgetMicroUsd = Math.round(llmSettings().regulatoryEvaluationBudgetUsd * 1_000_000);
    const attempt = job.attemptsMade + 1;
    await this.recoverAbandonedModelCalls(baseline.analysisRunId);

    let evaluated = 0;
    let failed = 0;
    let consecutiveFailures = 0;
    for (const [index, entry] of pending.entries()) {
      const evaluation = entry.evaluation!;
      const requirementText = entry.requirementText ?? entry.applicabilityRationale;
      const documentLabel = entry.provision
        ? [entry.provision.version.document.referenceNumber, entry.provision.version.document.title]
            .filter(Boolean)
            .join(" — ")
        : [entry.sourceReference, entry.sourceTitle].filter(Boolean).join(" — ") ||
          "Texte réglementaire identifié";
      const provisionIdentifier =
        entry.provision?.sourceIdentifier ??
        entry.sourceReference ??
        entry.sourceTitle ??
        "Texte complet";
      const sourceText = entry.provision?.content ?? entry.applicabilityRationale;
      const knowledgeExamples = await searchForPrompt(this.database, {
        feature: "CONFORMITY_EVALUATION",
        queryText: JSON.stringify({
          profileContext: baseline.profileSnapshot.data,
          requirement: { document: documentLabel, text: requirementText },
        }),
        // Examples are tagged with the project's home country (first of its countries).
        jurisdiction: projectCountryCodes(baseline.profileSnapshot.data)[0] ?? "",
        language: "fr",
        limit: 5,
      });
      await job.updateProgress({
        phase: "evaluating_conformity",
        progress: pending.length ? Math.floor((index / pending.length) * 95) : 95,
        completed: index,
        total: pending.length,
        evaluationId: evaluation.id,
      });
      await this.database.regulatoryEvaluation.updateMany({
        where: { id: evaluation.id, evaluatedAt: null },
        data: { aiStatus: "RUNNING", aiErrorMessage: null },
      });

      const promptInput = {
        profileContext: baseline.profileSnapshot.data,
        requirement: {
          text: requirementText,
          applicabilityRationale: entry.applicabilityRationale,
          document: documentLabel,
          provisionIdentifier,
          sourceText,
          supportingExcerpts: entry.requirementSupportingExcerpts,
        },
        evidence: evaluation.evidence.map(({ kind, label, note, url }) => ({
          kind,
          label,
          note,
          url,
        })),
        knowledgeExamples,
        currentDate: new Date().toISOString().slice(0, 10),
        language: snapshotLanguage(baseline.profileSnapshot.data),
      };
      const prompt = regulatoryConformityPrompt.build(promptInput);

      let reservation: ReservedModelCall;
      try {
        reservation = await this.reserveModelCall({
          runId: baseline.analysisRunId,
          provisionId: entry.provisionId,
          attempt,
          provider,
          model,
          prompt,
          maxOutputTokens,
          budgetMicroUsd,
        });
      } catch (error) {
        if (!(error instanceof RegulatoryEvaluationBudgetError)) throw error;
        // The budget is a hard ceiling, not a transient fault: retrying the job would burn
        // attempts without ever succeeding, so park the remainder for an explicit re-run.
        const remaining = pending.slice(index).map((item) => item.evaluation!.id);
        await this.failEvaluations(remaining, error.message);
        failed += remaining.length;
        this.logger.error(
          { event: "regulatory_evaluation_budget_exhausted", jobId: job.id, baselineId, evaluated },
          "regulatory evaluation budget exhausted",
        );
        break;
      }

      const callStartedAt = Date.now();
      try {
        const generated = await generateText({
          model: languageModel({ provider, model }),
          system: prompt.system,
          prompt: prompt.context,
          output: Output.object({ schema: conformityAssessmentSchema }),
          timeout: timeoutMs,
          maxOutputTokens,
          maxRetries: 0,
          providerOptions: regulatoryProviderOptions({
            provider,
            model,
            reasoningEffort,
            promptCacheKey: `regulatory-evaluation:${baseline.analysisRunId}`,
          }),
          telemetry: { isEnabled: false },
        });
        await this.settleModelCall(reservation, {
          status: "SUCCEEDED",
          inputTokens: generated.totalUsage.inputTokens ?? 0,
          cachedInputTokens: generated.totalUsage.inputTokenDetails?.cacheReadTokens ?? 0,
          outputTokens: generated.totalUsage.outputTokens ?? 0,
          reasoningTokens: generated.totalUsage.outputTokenDetails?.reasoningTokens ?? 0,
          latencyMs: Date.now() - callStartedAt,
        });
        const normalized = normalizeConformityAssessment(
          generated.output,
          JSON.stringify({
            profileContext: promptInput.profileContext,
            evidence: promptInput.evidence,
          }),
        );
        await this.database.$transaction(async (tx) => {
          const claimed = await tx.regulatoryEvaluation.updateMany({
            where: { id: evaluation.id, evaluatedAt: null },
            data: {
              // The assessment is written straight into the evaluation's own result. A reviewer
              // opens the requirement to change it, not to transcribe it.
              result: normalized.suggestedResult,
              revision: { increment: 1 },
              aiStatus: "COMPLETED",
              aiSuggestedResult: normalized.suggestedResult,
              aiRationale: normalized.rationale,
              aiConfidence: normalized.confidence,
              aiMatchedProfileKeys: normalized.matchedProfileKeys,
              aiMissingInformation: normalized.missingInformation,
              aiRemediationPlan: normalized.remediationPlan,
              aiActionTitle: normalized.action.title,
              aiActionResources: normalized.action.resources,
              aiActionStartDate: normalized.action.startDate
                ? new Date(`${normalized.action.startDate}T00:00:00.000Z`)
                : null,
              aiActionDueDate: normalized.action.dueDate
                ? new Date(`${normalized.action.dueDate}T00:00:00.000Z`)
                : null,
              aiResponsible: normalized.action.responsible,
              aiEffectivenessCriteria: normalized.action.effectivenessCriteria,
              aiModel: model,
              aiProvider: provider,
              aiPromptKey: regulatoryConformityPrompt.key,
              aiPromptVersion: regulatoryConformityPrompt.version,
              aiEvaluatedAt: new Date(),
              aiErrorMessage: null,
            },
          });
          // A human may have signed the requirement off while the model call was in flight; that
          // decision wins, and no proposed action is created behind it.
          if (claimed.count !== 1 || !normalized.action.title) return;
          if (await tx.regulatoryEvaluationAction.count({ where: { evaluationId: evaluation.id } }))
            return;
          await tx.regulatoryEvaluationAction.create({
            data: {
              evaluationId: evaluation.id,
              title: normalized.action.title,
              assigneeId: null,
              responsibleName: normalized.action.responsible,
              resources: normalized.action.resources,
              dueDate: normalized.action.dueDate
                ? new Date(`${normalized.action.dueDate}T00:00:00.000Z`)
                : null,
              status: "OPEN",
              effectivenessCriteria: normalized.action.effectivenessCriteria,
              effectiveness: "PENDING",
            },
          });
        });
        evaluated += 1;
        consecutiveFailures = 0;
      } catch (error) {
        const timedOut = isTimeoutError(error);
        await this.settleModelCall(reservation, {
          status: timedOut ? "TIMED_OUT" : "FAILED",
          latencyMs: Date.now() - callStartedAt,
          errorCode: timedOut ? "REGULATORY_MODEL_TIMEOUT" : "REGULATORY_MODEL_UNAVAILABLE",
          usage: failureUsage(error),
        });
        const message = error instanceof Error ? error.message : "Unknown evaluation error";
        await this.failEvaluations([evaluation.id], message);
        failed += 1;
        consecutiveFailures += 1;
        this.logger.error(
          {
            event: "regulatory_evaluation_entry_failed",
            jobId: job.id,
            baselineId,
            evaluationId: evaluation.id,
            provisionId: entry.provisionId,
            consecutiveFailures,
            error: message,
          },
          "regulatory evaluation entry failed",
        );
        // One bad entry must not strand the rest of the baseline, so the loop continues.
        // A run of failures in a row means the provider itself is down: stop then rather than
        // paying for every remaining entry to fail. Rethrowing leaves the untouched entries
        // PENDING for BullMQ's next attempt to pick up; on the last attempt there is no next
        // one, so they are marked FAILED instead of being stranded PENDING forever.
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          if (attempt < (job.opts.attempts ?? 1)) throw error;
          const remaining = pending.slice(index + 1).map((item) => item.evaluation!.id);
          await this.failEvaluations(remaining, message);
          failed += remaining.length;
          break;
        }
      }
    }

    await job.updateProgress({
      phase: "completed",
      progress: 100,
      completed: pending.length,
      total: pending.length,
    });
    return { processed: true, evaluated, failed, idempotencyKey: envelope.idempotencyKey };
  }
}
