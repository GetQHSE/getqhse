import { Processor, WorkerHost } from "@nestjs/bullmq";
import {
  llmSettings,
  openAiProvider,
  regulatoryApplicabilityPrompt,
  regulatoryRequirementVerificationPrompt,
  regulatoryTriagePrompt,
} from "@qhse/ai";
import { RegulatoryAnalysisError, type JobEnvelope } from "@qhse/contracts";
import {
  Prisma,
  createPrismaClient,
  unindexedSearchableChunkFilter,
  type DatabaseClient,
} from "@qhse/database";
import { reciprocalRankFusion } from "@qhse/knowledge";
import { createLogger, currentTraceId } from "@qhse/observability";
import { Output, embed, generateText } from "ai";
import type { Job } from "bullmq";
import { z } from "zod";

import { queueNames } from "../queues.js";
import {
  conservativeInputTokens,
  failureUsage,
  isTimeoutError,
  positiveNumber,
  regulatoryCostMicroUsd,
  regulatoryPrimaryModel,
  regulatoryProviderOptions,
  regulatoryTriageModel,
  regulatoryVerificationModel,
  type RegulatoryTokenUsage,
} from "./regulatory-model-cost.js";
import { acquireModelTokens } from "./regulatory-rate-limiter.js";

export { regulatoryCostMicroUsd };

type ChangeType = "ADDED" | "UNCHANGED" | "MODIFIED" | "REMOVAL_PROPOSED";

type RetrievedProvision = {
  provisionId: string;
  documentId: string;
  documentVersionId: string;
  documentTitle: string;
  referenceNumber: string | null;
  documentFamily: "standard" | "regulation";
  provisionType: "clause" | "article" | "definition" | "annex" | "table" | "note" | "section";
  identifier: string | null;
  title: string | null;
  headingPath: string[];
  language: string;
  content: string;
  contentHash: string;
  score: number;
};

type CandidateInput = RetrievedProvision & {
  previousEntryId: string | null;
  changeType: ChangeType;
  changeSummary: string | null;
  previousRationale: string | null;
  previousRequirementText: string | null;
  previousRequirementSupportingExcerpts: string[];
};

type ClassifiedCandidate = CandidateInput & {
  suggestion: "APPLICABLE" | "TO_CONFIRM" | "NOT_APPLICABLE";
  rationale: string;
  matchedProfileKeys: string[];
  confidence: number;
  clarificationQuestion: string | null;
  requirementText: string | null;
  requirementStatus: "READY" | "SOURCE_REVIEW_REQUIRED" | "NOT_REQUIRED";
  requirementSupportingExcerpts: string[];
  requirementIssues: string[];
  requirementSource: "AI" | "HUMAN" | "CARRIED_FORWARD" | null;
};

export type ClassificationModelStage = "drafting" | "verification" | "triage";

type ReservedModelCall = {
  id: string;
  model: string;
  reservedMicroUsd: number;
};

const TRIAGE_PROGRESS_START = 35;
const TRIAGE_PROGRESS_END = 50;
const CLASSIFICATION_PROGRESS_START = 50;
const CLASSIFICATION_PROGRESS_END = 92;
const MODEL_HEARTBEAT_INTERVAL_MS = 30_000;
const CLASSIFICATION_CONCURRENCY = 5;
const RETRIEVAL_QUERY_CONCURRENCY = 5;
const TRIAGE_CONCURRENCY = 5;
// The flex service tier answers with a 429 when capacity is unavailable, which is a normal
// scheduling outcome rather than a quota problem, so it needs a longer runway than a plain
// rate limit would. parseRateLimitRetryDelayMs still honours any delay the error names.
const RATE_LIMIT_MAX_ATTEMPTS = 6;
const RATE_LIMIT_FALLBACK_DELAY_MS = 5_000;
// Default sits comfortably under the 500k TPM tier this pipeline was built against. Set
// REGULATORY_TOKENS_PER_MINUTE to whatever the account's real per-model ceiling is — a value
// left too high stops preventing 429s at all, and one left too low just paces calls slower than
// the account could actually sustain.
const REGULATORY_TOKENS_PER_MINUTE_FALLBACK = 400_000;

function regulatoryTokensPerMinute(): number {
  return positiveNumber("REGULATORY_TOKENS_PER_MINUTE", REGULATORY_TOKENS_PER_MINUTE_FALLBACK);
}

// Concurrent lanes (classification, triage batches, and retrieval queries) can all hit a 429 in
// the same instant. Retrying at an identical fixed delay just collides them again on the next
// attempt; spreading the next attempt over a random window means most of them succeed without a
// second round of contention.
const RETRY_JITTER_MS = 2_000;

export function jitteredDelay(baseMs: number, jitterMs: number = RETRY_JITTER_MS): number {
  return baseMs + Math.round(Math.random() * jitterMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ModelCallSettlement =
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
    };

// A rate-limited call never reached the provider's generation step, so its real cost is zero —
// charging it the full conservative reservation billed retries for work that never happened, and
// on the flex tier (which answers capacity pressure with 429s by design) that repeats on every
// attempt, up to RATE_LIMIT_MAX_ATTEMPTS times per call. Only the rate-limit case is trusted with
// this: a bare "FAILED" with no usage also covers a fatal, run-ending error whose failure point
// (validation before or after generation) is not something this code can tell apart, so it keeps
// the conservative charge. TIMED_OUT keeps it too, since an aborted request's real token count is
// genuinely unknown.
export function settlementChargeMicroUsd(
  reservedMicroUsd: number,
  result: ModelCallSettlement,
  model: string,
): number {
  if (result.status === "SUCCEEDED") return regulatoryCostMicroUsd(result, model);
  if (result.usage) return regulatoryCostMicroUsd(result.usage, model);
  if (result.errorCode === "REGULATORY_MODEL_RATE_LIMITED") return 0;
  return reservedMicroUsd;
}

export function regulatoryModelLimits(stage: ClassificationModelStage) {
  const settings = llmSettings();
  return {
    timeoutMs: settings.regulatoryTimeoutMs,
    maxOutputTokens:
      stage === "drafting"
        ? settings.regulatoryDraftMaxOutputTokens
        : stage === "verification"
          ? settings.regulatoryVerificationMaxOutputTokens
          : settings.regulatoryTriageMaxOutputTokens,
  };
}

export function regulatoryTriageProgress(completed: number, total: number): number {
  if (total <= 0) return TRIAGE_PROGRESS_END;
  const boundedCompleted = Math.min(Math.max(completed, 0), total);
  return (
    TRIAGE_PROGRESS_START +
    Math.floor((boundedCompleted / total) * (TRIAGE_PROGRESS_END - TRIAGE_PROGRESS_START))
  );
}

export function regulatoryClassificationProgress(completed: number, total: number): number {
  if (total <= 0) return CLASSIFICATION_PROGRESS_END;
  const boundedCompleted = Math.min(Math.max(completed, 0), total);
  return (
    CLASSIFICATION_PROGRESS_START +
    Math.floor(
      (boundedCompleted / total) * (CLASSIFICATION_PROGRESS_END - CLASSIFICATION_PROGRESS_START),
    )
  );
}

const classificationSchema = z.object({
  suggestion: z.enum(["APPLICABLE", "TO_CONFIRM", "NOT_APPLICABLE"]),
  rationale: z.string().trim().min(1).max(2_000),
  matchedProfileKeys: z.array(z.string().max(120)).max(12),
  confidence: z.number().min(0).max(1),
  clarificationQuestion: z.string().trim().min(3).max(500).nullable(),
  sourceQuality: z.enum(["PASS", "BLOCKED"]),
  normativeRequirement: z.boolean(),
  requirementText: z.string().trim().min(20).max(1_200).nullable(),
  supportingExcerpts: z.array(z.string().trim().min(1).max(500)).max(3),
  qualityIssues: z.array(z.string().trim().min(1).max(300)).max(8),
});

const verificationSchema = z.object({
  supported: z.boolean(),
  issues: z.array(z.string().trim().min(1).max(300)).max(8),
});

const triageBatchSchema = z.object({
  decisions: z
    .array(
      z.object({
        provisionId: z.string(),
        likelyApplicable: z.enum(["YES", "NO", "UNSURE"]),
      }),
    )
    .max(60),
});

function profileFields(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || !("fields" in data)) return {};
  const fields = (data as { fields?: unknown }).fields;
  return fields && typeof fields === "object" ? (fields as Record<string, unknown>) : {};
}

function compact(value: unknown): string {
  return JSON.stringify(value ?? "").slice(0, 6_000);
}

function normalized(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .trim();
}

// The drafting prompt requires requirementText to be lifted verbatim from candidate.content,
// with only layout artefacts (line breaks, OCR hyphenation) cleaned up. When the model complies
// exactly, the independent verifier has nothing left to check: there is no paraphrase to
// overreach and no wording that could have come from anywhere but the source. Comparing through
// normalized() is what makes that safe — it ignores accents, case and punctuation spacing, so an
// un-hyphenated line break still counts as a quote, while any added, dropped or reordered word
// breaks the match and falls through to the verifier. This can only skip calls that would have
// returned supported=true; it can never let a fabricated requirement through.
export function isVerbatimRequirement(source: string, requirementText: string | null): boolean {
  const requirement = normalized(requirementText);
  if (!requirement) return false;
  return normalized(source).includes(requirement);
}

function logicalKey(provision: {
  documentId: string;
  language: string;
  identifier: string | null;
  headingPath: string[];
}): string {
  const location =
    normalized(provision.identifier) || normalized(provision.headingPath.join(" / "));
  return `${provision.documentId}:${provision.language}:${location}`;
}

function structuralIssues(
  provision: Pick<
    RetrievedProvision,
    "documentFamily" | "provisionType" | "identifier" | "title" | "headingPath" | "content"
  >,
): string[] {
  const issues: string[] = [];
  const identifier = normalized(provision.identifier);
  const title = normalized(provision.title);
  const heading = normalized(provision.headingPath.join(" "));
  const content = provision.content.trim();
  const combined = `${title} ${heading} ${normalized(content.slice(0, 800))}`;

  if (["definition", "note", "table", "section"].includes(provision.provisionType)) {
    issues.push(`Type de disposition non normatif: ${provision.provisionType}.`);
  }
  if (
    /\b(sommaire|table des matieres|contents?|avant propos|foreword|introduction|domaine d application)\b/u.test(
      combined,
    ) &&
    !identifier
  ) {
    issues.push("Couverture, sommaire ou section introductive détectée.");
  }
  if (
    content.length < 40 ||
    normalized(content) === normalized(provision.identifier) ||
    normalized(content) === title ||
    normalized(content) === normalized(`${provision.identifier ?? ""} ${provision.title ?? ""}`)
  ) {
    issues.push("Disposition sans contenu normatif exploitable.");
  }
  if (provision.documentFamily === "regulation") {
    if (
      provision.provisionType !== "article" ||
      !/^(article|المادة)\s+/iu.test(provision.identifier?.trim() ?? "")
    ) {
      issues.push("Une réglementation doit être rattachée à un article identifié.");
    }
  } else {
    if (provision.provisionType === "clause") {
      if (!/^\d+(?:\.\d+)+$/u.test(provision.identifier?.trim() ?? "")) {
        issues.push("La clause normative ne possède pas d’identifiant valide.");
      }
      if (/^0(?:\.|$)/u.test(provision.identifier?.trim() ?? "")) {
        issues.push("Les clauses introductives 0.x sont exclues.");
      }
    } else if (provision.provisionType === "annex") {
      if (
        /\b(informative|informatif|informative)\b/u.test(combined) ||
        !/\b(normative|normatif|normativa)\b/u.test(combined)
      ) {
        issues.push("L’annexe n’est pas explicitement normative.");
      }
    } else {
      issues.push("Une norme doit être rattachée à une clause ou à une annexe normative.");
    }
  }
  return [...new Set(issues)];
}

export function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /rate limit|\b429\b/iu.test(`${error.name} ${error.message}`);
}

export function parseRateLimitRetryDelayMs(error: unknown, fallbackMs: number): number {
  if (!(error instanceof Error)) return fallbackMs;
  const match = /try again in\s+([\d.]+)\s*s/iu.exec(error.message);
  if (!match) return fallbackMs;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return fallbackMs;
  return Math.ceil(seconds * 1_000) + 250;
}

// A provision retrieval picked up can be deleted or reprocessed (reindex, purge) before
// classification reaches it, minutes later. That insert then fails this specific foreign
// key rather than some unrelated one, so this candidate can be skipped without guessing at
// what else P2003 might mean.
export function isMissingProvisionForeignKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ((error as { code?: unknown }).code !== "P2003") return false;
  const meta = (error as { meta?: { modelName?: unknown } }).meta;
  return meta?.modelName === "RegulatoryModelCall";
}

export function splitReservedCost(totalMicroUsd: number, count: number): number[] {
  const base = Math.floor(totalMicroUsd / count);
  const remainder = totalMicroUsd - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function batchForTriage<T>(candidates: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < candidates.length; index += batchSize) {
    batches.push(candidates.slice(index, index + batchSize));
  }
  return batches;
}

export type TriageDecision = {
  provisionId: string;
  likelyApplicable: "YES" | "NO" | "UNSURE";
};

export function normalizeTriageDecisions<T extends { provisionId: string }>(
  batch: T[],
  rawDecisions: TriageDecision[],
): TriageDecision[] {
  const batchIds = new Set(batch.map((candidate) => candidate.provisionId));
  const seen = new Set<string>();
  const normalized: TriageDecision[] = [];
  for (const decision of rawDecisions) {
    if (!batchIds.has(decision.provisionId)) continue;
    if (seen.has(decision.provisionId)) continue;
    seen.add(decision.provisionId);
    normalized.push(decision);
  }
  return normalized;
}

export function selectTriageSurvivors<T extends { provisionId: string }>(
  candidates: T[],
  decisions: TriageDecision[],
  includeUnsure: boolean,
): T[] {
  const byProvisionId = new Map(
    decisions.map((decision) => [decision.provisionId, decision.likelyApplicable]),
  );
  return candidates.filter((candidate) => {
    const decision = byProvisionId.get(candidate.provisionId);
    if (decision === undefined || decision === "YES") return true;
    if (decision === "NO") return false;
    return includeUnsure;
  });
}

export function isStructurallyEligibleProvision(
  provision: Pick<
    RetrievedProvision,
    "documentFamily" | "provisionType" | "identifier" | "title" | "headingPath" | "content"
  >,
): boolean {
  return structuralIssues(provision).length === 0;
}

export function validateRequirementDraft(
  source: string,
  requirementText: string | null,
  supportingExcerpts: string[],
): string[] {
  const issues: string[] = [];
  if (source.length > 30_000)
    issues.push("La disposition dépasse la taille maximale et serait tronquée.");
  if (!requirementText?.trim()) issues.push("Aucune exigence n’a été rédigée.");
  if (
    requirementText &&
    (requirementText.trim().length < 20 || requirementText.trim().length > 1_200)
  ) {
    issues.push("La longueur de l’exigence est invalide.");
  }
  if (supportingExcerpts.length < 1 || supportingExcerpts.length > 3) {
    issues.push("Un à trois extraits justificatifs exacts sont requis.");
  }
  const uniqueExcerpts = new Set<string>();
  for (const excerpt of supportingExcerpts) {
    if (excerpt.length > 500) issues.push("Un extrait justificatif dépasse 500 caractères.");
    if (!source.includes(excerpt))
      issues.push("Un extrait justificatif n’est pas une citation exacte de la disposition.");
    const key = normalized(excerpt);
    if (uniqueExcerpts.has(key)) issues.push("Un extrait justificatif est dupliqué.");
    uniqueExcerpts.add(key);
  }
  if (/\uFFFD/u.test(source) || (source.match(/\|/g)?.length ?? 0) > 30) {
    issues.push("Le texte source semble corrompu par l’extraction ou l’OCR.");
  }
  return [...new Set(issues)];
}

export function canCarryForwardRequirement(
  candidate: Pick<
    CandidateInput,
    "changeType" | "content" | "previousRequirementText" | "previousRequirementSupportingExcerpts"
  >,
  profileChanges: readonly unknown[],
): boolean {
  return (
    candidate.changeType === "UNCHANGED" &&
    profileChanges.length === 0 &&
    Boolean(candidate.previousRequirementText) &&
    validateRequirementDraft(
      candidate.content,
      candidate.previousRequirementText,
      candidate.previousRequirementSupportingExcerpts,
    ).length === 0
  );
}

export function dedupeRegulatoryProvisions<T extends RetrievedProvision>(provisions: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const provision of provisions) {
    const key = logicalKey(provision);
    const existing = byKey.get(key);
    const provisionEligible = isStructurallyEligibleProvision(provision);
    const existingEligible = existing ? isStructurallyEligibleProvision(existing) : false;
    if (
      !existing ||
      (provisionEligible && !existingEligible) ||
      (provisionEligible === existingEligible && Number(provision.score) > Number(existing.score))
    ) {
      byKey.set(key, provision);
    }
  }
  return [...byKey.values()].sort((left, right) => Number(right.score) - Number(left.score));
}

export function matchProvisionRevision<
  T extends {
    documentId: string;
    language: string;
    identifier: string | null;
    headingPath: string[];
    contentHash: string;
  },
>(previous: T, available: T[]): { match: T | null; changeType: ChangeType; ambiguous: boolean } {
  const matches = available.filter((candidate) => logicalKey(candidate) === logicalKey(previous));
  if (matches.length !== 1) {
    return { match: null, changeType: "REMOVAL_PROPOSED", ambiguous: matches.length > 1 };
  }
  const match = matches[0]!;
  return {
    match,
    changeType: match.contentHash === previous.contentHash ? "UNCHANGED" : "MODIFIED",
    ambiguous: false,
  };
}

export function computeProfileChanges(
  previousData: unknown,
  currentData: unknown,
): Array<{ key: string; previous: unknown; current: unknown }> {
  const previous = profileFields(previousData);
  const current = profileFields(currentData);
  return [...new Set([...Object.keys(previous), ...Object.keys(current)])]
    .sort()
    .filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(current[key]))
    .map((key) => ({ key, previous: previous[key] ?? null, current: current[key] ?? null }));
}

export function buildRegulatoryQueries(snapshotData: unknown): string[] {
  const fields = profileFields(snapshotData);
  const fieldQueries = Object.entries(fields)
    .filter(([, value]) => value !== null && value !== undefined && compact(value).length > 2)
    .map(([key, value]) => `${key.replace(/[._]/g, " ")} ${compact(value)} exigences Maroc`);
  const queries = [
    [
      fields["organization.primarySector"],
      fields["organization.offerings"],
      "Maroc réglementation",
    ],
    [
      fields["operations.keyProcesses"],
      fields["operations.externalProviders"],
      "exigences légales",
    ],
    [fields["scope.operatingCountries"], fields["scope.certificationScope"], "champ application"],
    [fields["regulatory.knownRequirements"], fields["regulatory.implementedFrameworks"]],
    [fields["organization.employeeCount"], fields["regulatory.criticalRisks"], "obligations"],
    ["ISO 9001", fields["scope.certificationScope"], fields["operations.keyProcesses"]],
  ]
    .map((parts) => parts.map(compact).join(" ").replace(/\s+/g, " ").trim())
    .filter((query) => query.length >= 3);
  return [...new Set([...queries, ...fieldQueries])].slice(0, 12);
}

@Processor(queueNames.regulatoryAnalysis, { concurrency: 2 })
export class RegulatoryAnalysisProcessor extends WorkerHost {
  private readonly database: DatabaseClient = createPrismaClient();
  private readonly logger = createLogger({ base: { service: "qhse-worker" } });

  private async reserveModelCall(input: {
    runId: string;
    provisionId: string;
    clarificationRevision: number;
    stage: ClassificationModelStage;
    attempt: number;
    model: string;
    prompt: { system: string; context: string };
    maxOutputTokens: number;
  }): Promise<ReservedModelCall> {
    const reservedMicroUsd = regulatoryCostMicroUsd(
      { inputTokens: conservativeInputTokens(input.prompt), outputTokens: input.maxOutputTokens },
      input.model,
    );
    const call = await this.database.$transaction(async (tx) => {
      const created = await tx.regulatoryModelCall.create({
        data: {
          runId: input.runId,
          provisionId: input.provisionId,
          clarificationRevision: input.clarificationRevision,
          stage: input.stage,
          attempt: input.attempt,
          model: input.model,
          reservedMicroUsd,
        },
        select: { id: true },
      });
      await tx.regulatoryAnalysisRun.update({
        where: { id: input.runId },
        data: { reservedMicroUsd: { increment: reservedMicroUsd } },
      });
      return created;
    });
    return { id: call.id, model: input.model, reservedMicroUsd };
  }

  // One triage call covers a batch of provisions, but the ledger's regulatory_model_call
  // rows are per-provision. Record it as one ledger row per provisionId with its even split of
  // the reservation, so per-provision cost stays queryable like every other stage.
  private async reserveTriageBatchCall(input: {
    runId: string;
    provisionIds: string[];
    clarificationRevision: number;
    attempt: number;
    model: string;
    prompt: { system: string; context: string };
    maxOutputTokens: number;
  }): Promise<{ ids: string[]; shares: number[] }> {
    const totalReservedMicroUsd = regulatoryCostMicroUsd(
      { inputTokens: conservativeInputTokens(input.prompt), outputTokens: input.maxOutputTokens },
      input.model,
    );
    const shares = splitReservedCost(totalReservedMicroUsd, input.provisionIds.length);
    return this.database.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const [index, provisionId] of input.provisionIds.entries()) {
        const call = await tx.regulatoryModelCall.create({
          data: {
            runId: input.runId,
            provisionId,
            clarificationRevision: input.clarificationRevision,
            stage: "triage",
            attempt: input.attempt,
            model: input.model,
            reservedMicroUsd: shares[index]!,
          },
          select: { id: true },
        });
        ids.push(call.id);
      }
      await tx.regulatoryAnalysisRun.update({
        where: { id: input.runId },
        data: { reservedMicroUsd: { increment: totalReservedMicroUsd } },
      });
      return { ids, shares };
    });
  }

  private async settleModelCall(
    runId: string,
    reservation: ReservedModelCall,
    result: ModelCallSettlement,
  ): Promise<void> {
    const succeeded = result.status === "SUCCEEDED";
    const chargedMicroUsd = settlementChargeMicroUsd(
      reservation.reservedMicroUsd,
      result,
      reservation.model,
    );
    await this.database.$transaction(async (tx) => {
      const call = await tx.regulatoryModelCall.findUnique({
        where: { id: reservation.id },
        select: { status: true },
      });
      if (!call || call.status !== "RUNNING") return;
      await tx.regulatoryModelCall.update({
        where: { id: reservation.id },
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
      await tx.regulatoryAnalysisRun.update({
        where: { id: runId },
        data: {
          reservedMicroUsd: { decrement: reservation.reservedMicroUsd },
          spentMicroUsd: { increment: chargedMicroUsd },
          ...(succeeded
            ? {
                inputTokens: { increment: result.inputTokens },
                cachedInputTokens: { increment: result.cachedInputTokens },
                outputTokens: { increment: result.outputTokens },
                reasoningTokens: { increment: result.reasoningTokens },
              }
            : {}),
        },
      });
    });
  }

  // A call abandoned by a worker restart never reached a settlement, so — like a rate-limited
  // call — whether it billed anything is unknown, and charging it as if it had spent its entire
  // conservative reservation (full input estimate plus the whole output-token ceiling) is a
  // worst case, not a measurement. That worst case used to get charged in full on every recovery,
  // so a run that kept retrying (worker crash-looping, a deploy landing mid-run, a stalled lock)
  // burned through its budget on phantom cost that had no relationship to what OpenAI actually
  // billed. Zero is the same call this code already makes for rate limits: the honest answer when
  // the real cost cannot be known is to not fabricate one.
  private async recoverAbandonedModelCalls(runId: string): Promise<void> {
    await this.database.$transaction(async (tx) => {
      const abandoned = await tx.regulatoryModelCall.findMany({
        where: { runId, status: "RUNNING" },
        select: { id: true },
      });
      if (!abandoned.length) return;
      await tx.regulatoryModelCall.updateMany({
        where: { id: { in: abandoned.map((call) => call.id) } },
        data: {
          status: "FAILED",
          costMicroUsd: 0,
          errorCode: "WORKER_RESTARTED",
          completedAt: new Date(),
        },
      });
      await tx.regulatoryAnalysisRun.update({
        where: { id: runId },
        data: { reservedMicroUsd: 0 },
      });
    });
  }

  private async reportProgress(
    runId: string,
    job: Job<JobEnvelope>,
    progress: {
      phase: string;
      percent: number;
      completed?: number;
      total?: number;
      provisionId?: string;
      identifier?: string | null;
      documentId?: string;
      attempt?: number;
      stage?: string;
    },
  ): Promise<void> {
    await Promise.all([
      this.database.regulatoryAnalysisRun.update({
        where: { id: runId },
        data: { phase: progress.phase, progressPercent: progress.percent },
      }),
      job.updateProgress({
        phase: progress.phase,
        progress: progress.percent,
        ...(progress.completed === undefined ? {} : { completed: progress.completed }),
        ...(progress.total === undefined ? {} : { total: progress.total }),
        ...(progress.provisionId ? { provisionId: progress.provisionId } : {}),
        ...(progress.identifier ? { identifier: progress.identifier } : {}),
        ...(progress.documentId ? { documentId: progress.documentId } : {}),
        ...(progress.attempt === undefined ? {} : { attempt: progress.attempt }),
        ...(progress.stage ? { stage: progress.stage } : {}),
        updatedAt: new Date().toISOString(),
      }),
    ]);
  }

  async process(job: Job<JobEnvelope>) {
    const runId = typeof job.data.payload["runId"] === "string" ? job.data.payload["runId"] : null;
    if (!runId) throw new Error("Regulatory analysis runId is required");
    const startedAt = Date.now();
    this.logger.info(
      {
        event: "regulatory_analysis_started",
        runId,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
      },
      "regulatory analysis started",
    );
    try {
      await this.analyze(runId, job);
      this.logger.info(
        {
          event: "regulatory_analysis_finished",
          runId,
          jobId: job.id,
          durationMs: Date.now() - startedAt,
        },
        "regulatory analysis finished",
      );
      return { runId, processed: true };
    } catch (error) {
      const current = await this.database.regulatoryAnalysisRun.findUnique({
        where: { id: runId },
      });
      if (!current || current.status === "SUPERSEDED") return { runId, processed: false };
      const message = error instanceof Error ? error.message : "Unknown regulatory analysis error";
      const code = error instanceof RegulatoryAnalysisError ? error.code : "ANALYSIS_FAILED";
      const traceId = currentTraceId();
      this.logger.error(
        {
          event: "regulatory_analysis_failed",
          runId,
          jobId: job.id,
          code,
          durationMs: Date.now() - startedAt,
          ...(traceId ? { traceId } : {}),
          err: error,
        },
        "regulatory analysis failed",
      );
      await this.database.$transaction([
        this.database.regulatoryAnalysisRun.update({
          where: { id: runId },
          data: {
            status: "FAILED",
            phase: "failed",
            errorCode: code,
            errorMessage: message.slice(0, 4_000),
          },
        }),
        this.database.projectRegulatoryWatch.update({
          where: { id: current.watchId },
          data: { status: current.baseBaselineId ? "STALE" : "FAILED" },
        }),
      ]);
      throw error;
    }
  }

  /**
   * Resolves the profile search runs against, distinguishing "never indexed"
   * from "still indexing" from "indexed but never activated" so the failure the
   * customer sees points at the actual rollout step that is missing.
   */
  private async resolveActiveEmbeddingProfile() {
    const active = await this.database.embeddingProfile.findFirst({ where: { status: "ACTIVE" } });
    if (active) {
      const stale = await this.database.documentChunk.findFirst({
        where: unindexedSearchableChunkFilter(active.id),
        select: { id: true },
      });
      if (stale) {
        throw new RegulatoryAnalysisError(
          "EMBEDDING_PROFILE_STALE",
          `Active embedding profile ${active.key} does not cover every searchable revision`,
        );
      }
      return active;
    }

    const latest = await this.database.embeddingProfile.findFirst({
      where: { status: { in: ["BUILDING", "READY"] } },
      orderBy: [{ version: "desc" }],
    });
    if (!latest) {
      throw new RegulatoryAnalysisError(
        "EMBEDDING_PROFILE_MISSING",
        "No embedding profile exists: the normative corpus has never been indexed",
      );
    }
    if (latest.status === "READY") {
      throw new RegulatoryAnalysisError(
        "EMBEDDING_PROFILE_NOT_ACTIVATED",
        `Embedding profile ${latest.key} is READY but was never activated`,
      );
    }
    throw new RegulatoryAnalysisError(
      "EMBEDDING_PROFILE_BUILDING",
      `Embedding profile ${latest.key} is still indexing the normative corpus`,
    );
  }

  private async stillCurrent(runId: string): Promise<boolean> {
    const run = await this.database.regulatoryAnalysisRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    return Boolean(
      run &&
      !["SUPERSEDED", "FAILED", "PARTIAL", "READY_FOR_REVIEW", "COMPLETED"].includes(run.status),
    );
  }

  private async analyze(runId: string, job: Job<JobEnvelope>): Promise<void> {
    if (!llmSettings().ragEnabled) {
      throw new RegulatoryAnalysisError(
        "NORMATIVE_RAG_DISABLED",
        "Retrieval must be enabled in the LLM settings for the worker to run a regulatory analysis",
      );
    }
    if (!llmSettings().apiKey) {
      throw new RegulatoryAnalysisError("OPENAI_KEY_MISSING", "An OpenAI API key is required");
    }
    const run = await this.database.regulatoryAnalysisRun.findUnique({
      where: { id: runId },
      include: {
        profileSnapshot: true,
        scopeFacts: true,
        baseBaseline: {
          include: {
            profileSnapshot: true,
            analysisRun: {
              include: { candidates: { select: { provisionId: true, decision: true } } },
            },
            entries: {
              orderBy: { orderIndex: "asc" },
              include: { provision: { include: { version: { include: { document: true } } } } },
            },
          },
        },
      },
    });
    if (!run) throw new Error("Regulatory analysis run not found");
    if (!["QUEUED", "RUNNING"].includes(run.status)) return;

    await this.recoverAbandonedModelCalls(run.id);

    await this.database.regulatoryAnalysisRun.update({
      where: { id: run.id },
      data: {
        status: "RUNNING",
        phase: "retrieval",
        progressPercent: 10,
        startedAt: run.startedAt ?? new Date(),
        errorCode: null,
        errorMessage: null,
      },
    });
    await job.updateProgress({ phase: "retrieval", progress: 10 });
    this.logger.info(
      {
        event: "regulatory_retrieval_started",
        runId: run.id,
        jobId: job.id,
        languages: run.languages,
      },
      "regulatory retrieval started",
    );

    const embeddingProfile = await this.resolveActiveEmbeddingProfile();

    const previousEntries = run.baseBaseline?.entries ?? [];
    const previousDocumentIds = [
      ...new Set(previousEntries.map((entry) => entry.provision.version.documentId)),
    ];
    const currentDocuments = previousDocumentIds.length
      ? await this.database.document.findMany({
          where: { id: { in: previousDocumentIds } },
          include: { currentVersion: { include: { provisions: true } } },
        })
      : [];
    const currentByKey = new Map<string, RetrievedProvision[]>();
    for (const document of currentDocuments) {
      const version = document.currentVersion;
      if (!version) continue;
      const effectiveDate = version.effectiveDate ?? document.effectiveDate ?? version.publishedAt;
      const expirationDate = version.expirationDate ?? document.expirationDate;
      const eligible =
        document.archivedAt === null &&
        document.deletedAt === null &&
        ["ORGANIZATION_AVAILABLE", "PUBLIC_REFERENCE"].includes(document.visibility) &&
        version.status === "PUBLISHED" &&
        version.validatedAt !== null &&
        version.storageAllowed &&
        version.extractionAllowed &&
        version.embeddingAllowed &&
        version.aiProcessingAllowed &&
        version.externalProviderAllowed &&
        version.excerptDisplayAllowed &&
        version.exportAllowed &&
        effectiveDate !== null &&
        effectiveDate <= run.asOf &&
        (expirationDate === null || expirationDate > run.asOf);
      if (!eligible) continue;
      for (const provision of version.provisions) {
        if (!run.languages.includes(provision.language)) continue;
        const item: RetrievedProvision = {
          provisionId: provision.id,
          documentId: document.id,
          documentVersionId: version.id,
          documentTitle: document.title,
          referenceNumber: document.referenceNumber,
          documentFamily: document.documentType === "standard" ? "standard" : "regulation",
          provisionType:
            provision.provisionType.toLowerCase() as RetrievedProvision["provisionType"],
          identifier: provision.sourceIdentifier,
          title: provision.title,
          headingPath: provision.headingPath,
          language: provision.language,
          content: provision.content,
          contentHash: provision.contentHash,
          score: 0,
        };
        const key = logicalKey(item);
        currentByKey.set(key, [...(currentByKey.get(key) ?? []), item]);
      }
    }

    const mandatory: CandidateInput[] = previousEntries.map((entry) => {
      const previous: RetrievedProvision = {
        provisionId: entry.provision.id,
        documentId: entry.provision.version.documentId,
        documentVersionId: entry.provision.documentVersionId,
        documentTitle: entry.provision.version.document.title,
        referenceNumber: entry.provision.version.document.referenceNumber,
        documentFamily:
          entry.provision.version.document.documentType === "standard" ? "standard" : "regulation",
        provisionType:
          entry.provision.provisionType.toLowerCase() as RetrievedProvision["provisionType"],
        identifier: entry.provision.sourceIdentifier,
        title: entry.provision.title,
        headingPath: entry.provision.headingPath,
        language: entry.provision.language,
        content: entry.provision.content,
        contentHash: entry.provision.contentHash,
        score: 0,
      };
      const resolution = matchProvisionRevision(
        previous,
        currentByKey.get(logicalKey(previous)) ?? [],
      );
      if (!resolution.match) {
        return {
          ...previous,
          previousEntryId: entry.id,
          previousRationale: entry.applicabilityRationale,
          previousRequirementText: entry.requirementText,
          previousRequirementSupportingExcerpts: entry.requirementSupportingExcerpts,
          changeType: "REMOVAL_PROPOSED" as const,
          changeSummary: !resolution.ambiguous
            ? "La disposition n’a pas été retrouvée dans la révision courante."
            : "Plusieurs dispositions correspondantes ont été trouvées; une validation humaine est nécessaire.",
        };
      }
      const current = resolution.match;
      return {
        ...current,
        previousEntryId: entry.id,
        previousRationale: entry.applicabilityRationale,
        previousRequirementText: entry.requirementText,
        previousRequirementSupportingExcerpts: entry.requirementSupportingExcerpts,
        changeType: resolution.changeType,
        changeSummary:
          resolution.changeType === "UNCHANGED"
            ? null
            : `La source est passée de ${entry.provision.version.versionLabel} à ${currentDocuments.find((item) => item.id === current.documentId)?.currentVersion?.versionLabel ?? "une nouvelle révision"}.`,
      };
    });

    const discovered = await this.retrieveAdditions(
      run,
      embeddingProfile.id,
      embeddingProfile.model,
      job,
    );
    this.logger.info(
      {
        event: "regulatory_retrieval_finished",
        runId: run.id,
        jobId: job.id,
        discoveredProvisions: discovered.length,
        previousEntries: previousEntries.length,
      },
      "regulatory retrieval finished",
    );
    const mandatoryKeys = new Set(mandatory.map(logicalKey));
    const previouslyExcludedIds = new Set(
      (run.baseBaseline?.analysisRun.candidates ?? [])
        .filter((candidate) => candidate.decision === "NOT_APPLICABLE")
        .map((candidate) => candidate.provisionId),
    );
    const discoveredAdditions: CandidateInput[] = discovered
      .filter(
        (candidate) =>
          !mandatoryKeys.has(logicalKey(candidate)) &&
          !previouslyExcludedIds.has(candidate.provisionId),
      )
      .map((candidate) => ({
        ...candidate,
        previousEntryId: null,
        previousRationale: null,
        previousRequirementText: null,
        previousRequirementSupportingExcerpts: [],
        changeType: "ADDED",
        changeSummary: "Nouvelle disposition potentiellement applicable.",
      }));

    if (!(await this.stillCurrent(run.id))) return;
    await this.reportProgress(run.id, job, { phase: "triage", percent: TRIAGE_PROGRESS_START });
    this.logger.info(
      {
        event: "regulatory_triage_started",
        runId: run.id,
        jobId: job.id,
        discovered: discoveredAdditions.length,
      },
      "regulatory triage started",
    );
    const triage = await this.triageAdditions(run, discoveredAdditions, job);
    const additions = triage.survivors;
    this.logger.info(
      {
        event: "regulatory_triage_finished",
        runId: run.id,
        jobId: job.id,
        discovered: discoveredAdditions.length,
        survivors: additions.length,
      },
      "regulatory triage finished",
    );

    if (!(await this.stillCurrent(run.id))) return;
    await this.reportProgress(run.id, job, {
      phase: "classification",
      percent: CLASSIFICATION_PROGRESS_START,
    });

    if (!previousEntries.length && !additions.length) {
      await this.coverageGap(run.id, run.watchId);
      return;
    }

    const profileChanges = computeProfileChanges(
      run.baseBaseline?.profileSnapshot.data,
      run.profileSnapshot.data,
    );
    const deterministic = mandatory
      .filter((candidate) => canCarryForwardRequirement(candidate, profileChanges))
      .map((candidate): ClassifiedCandidate => ({
        ...candidate,
        suggestion: "APPLICABLE",
        rationale: candidate.previousRationale ?? "Disposition conservée depuis la veille publiée.",
        matchedProfileKeys: [],
        confidence: 1,
        clarificationQuestion: null,
        requirementText: candidate.previousRequirementText,
        requirementStatus: "READY",
        requirementSupportingExcerpts: candidate.previousRequirementSupportingExcerpts,
        requirementIssues: [],
        requirementSource: "CARRIED_FORWARD",
      }));
    const toClassify = [
      ...mandatory.filter(
        (candidate) => !deterministic.some((item) => item.provisionId === candidate.provisionId),
      ),
      ...additions,
    ];
    const totalProvisions = deterministic.length + toClassify.length;
    await this.database.$transaction([
      this.database.regulatoryApplicabilityCandidate.deleteMany({
        where: {
          runId: run.id,
          classificationRevision: { not: run.clarificationRevision },
        },
      }),
      this.database.regulatoryAnalysisRun.update({
        where: { id: run.id },
        data: {
          totalProvisions,
          model: regulatoryPrimaryModel(),
          promptKey: regulatoryApplicabilityPrompt.key,
          promptVersion: regulatoryApplicabilityPrompt.version,
        },
      }),
    ]);
    await this.persistCandidates(run.id, run.clarificationRevision, deterministic);
    this.logger.info(
      {
        event: "regulatory_classification_started",
        runId: run.id,
        jobId: job.id,
        total: toClassify.length,
        carriedForward: deterministic.length,
      },
      "regulatory provision classification started",
    );
    const classification = await this.classifyProvisions(run, toClassify, profileChanges, job);
    const classified = classification.results;
    this.logger.info(
      {
        event: "regulatory_classification_finished",
        runId: run.id,
        jobId: job.id,
        total: toClassify.length,
        classified: classified.length,
      },
      "regulatory provision classification finished",
    );
    const byProvision = new Map(classified.map((item) => [item.provisionId, item]));
    for (const candidate of toClassify) {
      if (!byProvision.has(candidate.provisionId)) {
        byProvision.set(candidate.provisionId, {
          ...candidate,
          suggestion: candidate.previousEntryId ? "APPLICABLE" : "NOT_APPLICABLE",
          rationale: candidate.previousRationale ?? "Aucune décision exploitable n’a été produite.",
          matchedProfileKeys: [],
          confidence: 0,
          clarificationQuestion: null,
          requirementText: null,
          requirementStatus: "SOURCE_REVIEW_REQUIRED",
          requirementSupportingExcerpts: [],
          requirementIssues: ["Le modèle n’a produit aucune décision structurée exploitable."],
          requirementSource: null,
        });
      }
    }
    const finalCandidates = [...deterministic, ...byProvision.values()].map(
      (candidate): ClassifiedCandidate => {
        if (
          candidate.changeType === "UNCHANGED" &&
          candidate.previousEntryId &&
          candidate.suggestion === "NOT_APPLICABLE"
        ) {
          return {
            ...candidate,
            changeType: "REMOVAL_PROPOSED",
            changeSummary:
              "Le profil courant suggère que cette disposition pourrait ne plus être applicable.",
          };
        }
        return candidate;
      },
    );

    if (!(await this.stillCurrent(run.id))) return;
    await this.reportProgress(run.id, job, {
      phase: "finalizing",
      percent: 95,
      completed: finalCandidates.length,
      total: finalCandidates.length,
      stage: "persisting_candidates",
    });
    this.logger.info(
      {
        event: "regulatory_finalization_started",
        runId: run.id,
        jobId: job.id,
        candidates: finalCandidates.length,
      },
      "regulatory analysis finalization started",
    );
    await this.persistCandidates(run.id, run.clarificationRevision, finalCandidates);
    if (!(await this.stillCurrent(run.id))) return;

    const questions = finalCandidates
      .filter(
        (item): item is ClassifiedCandidate & { clarificationQuestion: string } =>
          item.suggestion === "TO_CONFIRM" && Boolean(item.clarificationQuestion),
      )
      .slice(0, 5);
    if (run.clarificationRevision === 0 && questions.length) {
      await this.awaitClarification(run.id, run.watchId, questions);
      await job.updateProgress({ phase: "clarification", progress: 70 });
      return;
    }

    const reviewCount = finalCandidates.filter(
      (candidate) =>
        candidate.requirementStatus === "SOURCE_REVIEW_REQUIRED" ||
        (candidate.changeType !== "UNCHANGED" &&
          !(candidate.changeType === "ADDED" && candidate.suggestion === "NOT_APPLICABLE")),
    ).length;
    if (run.baseBaselineId && reviewCount === 0) {
      const now = new Date();
      await this.database.$transaction([
        this.database.regulatoryAnalysisRun.update({
          where: { id: run.id },
          data: { status: "COMPLETED", phase: "no-change", progressPercent: 100, completedAt: now },
        }),
        this.database.projectRegulatoryWatch.update({
          where: { id: run.watchId },
          data: { status: "ACTIVE", lastCheckedAt: now, lastSuccessfulSyncAt: now },
        }),
      ]);
      await job.updateProgress({ phase: "no-change", progress: 100 });
      return;
    }

    await this.database.$transaction([
      this.database.regulatoryAnalysisRun.update({
        where: { id: run.id },
        data: {
          status: "READY_FOR_REVIEW",
          phase: "review",
          progressPercent: 100,
          completedAt: new Date(),
        },
      }),
      this.database.projectRegulatoryWatch.update({
        where: { id: run.watchId },
        data: { status: "REVIEW_REQUIRED", lastCheckedAt: new Date() },
      }),
    ]);
    await job.updateProgress({ phase: "review", progress: 100 });
  }

  private async retrieveAdditions(
    run: {
      id: string;
      asOf: Date;
      languages: string[];
      profileSnapshot: { data: Prisma.JsonValue };
    },
    embeddingProfileId: string,
    embeddingModel: string,
    job: Job<JobEnvelope>,
  ): Promise<RetrievedProvision[]> {
    const seeds = new Map<string, RetrievedProvision>();
    const queries = buildRegulatoryQueries(run.profileSnapshot.data);
    // Each query is an independent embed-then-search round trip merged into `seeds` by score, so
    // running them one at a time serialized a profile's worth of network latency before
    // classification could even begin. The merge itself is a synchronous Map write per query with
    // no `await` in between, so it stays safe under this bounded concurrency.
    let completedQueries = 0;
    const runQuery = async (index: number, query: string): Promise<void> => {
      const queryStartedAt = Date.now();
      const vectorResult = await embed({
        model: openAiProvider().embedding(embeddingModel),
        value: query,
        maxRetries: 3,
        providerOptions: { openai: { dimensions: 768 } },
        telemetry: { isEnabled: false },
      });
      if (vectorResult.embedding.length !== 768) throw new Error("Embedding dimensions mismatch");
      const vector = `[${vectorResult.embedding.join(",")}]`;
      const languageFilter = Prisma.join(run.languages.map((language) => Prisma.sql`${language}`));
      const selectColumns = Prisma.sql`
        p."id" AS "provisionId", d."id" AS "documentId",
          v."id" AS "documentVersionId", d."title" AS "documentTitle",
          d."reference_number" AS "referenceNumber",
          CASE WHEN d."document_type" = 'standard' THEN 'standard' ELSE 'regulation' END AS "documentFamily",
          lower(p."provision_type"::text) AS "provisionType",
          p."source_identifier" AS "identifier",
          p."title" AS "title", p."heading_path" AS "headingPath", p."language" AS "language",
          p."content" AS "content", p."content_hash" AS "contentHash"`;
      const filters = Prisma.sql`
          d."current_version_id" = v."id" AND v."status" = 'PUBLISHED'
          AND v."validated_at" IS NOT NULL AND d."status" <> 'ARCHIVED'
          AND d."archived_at" IS NULL AND d."deleted_at" IS NULL
          AND d."visibility" IN ('ORGANIZATION_AVAILABLE', 'PUBLIC_REFERENCE')
          AND v."storage_allowed" AND v."extraction_allowed" AND v."embedding_allowed"
          AND v."ai_processing_allowed" AND v."external_provider_allowed"
          AND v."excerpt_display_allowed" AND v."export_allowed"
          AND p."language" IN (${languageFilter})
          AND (d."country_code" = 'MA' OR (d."document_type" = 'standard' AND d."country_code" IS NULL)
            OR (d."document_type" = 'standard' AND lower(coalesce(d."jurisdiction", '')) IN ('global', 'international', 'iso')))
          AND coalesce(v."effective_date", d."effective_date", v."published_at"::date) <= ${dateOnly(run.asOf)}::date
          AND (coalesce(v."expiration_date", d."expiration_date") IS NULL
            OR coalesce(v."expiration_date", d."expiration_date") > ${dateOnly(run.asOf)}::date)`;
      const [keywordRows, semanticRows] = await Promise.all([
        this.database.$queryRaw<RetrievedProvision[]>(Prisma.sql`
          SELECT ${selectColumns},
            MAX(ts_rank_cd(c."search_vector", plainto_tsquery('simple', ${query}))) AS "score"
          FROM "document_chunks" c
          JOIN "document_embeddings" e ON e."document_chunk_id" = c."id"
            AND e."embedding_profile_id" = ${embeddingProfileId}
          JOIN "document_provisions" p ON p."id" = c."document_provision_id"
          JOIN "document_versions" v ON v."id" = p."document_version_id"
          JOIN "documents" d ON d."id" = v."document_id"
          WHERE ${filters} AND c."search_vector" @@ plainto_tsquery('simple', ${query})
          GROUP BY p."id", d."id", v."id", d."title", d."reference_number", d."document_type",
            p."provision_type", p."source_identifier", p."title", p."heading_path", p."language",
            p."content", p."content_hash"
          ORDER BY "score" DESC, p."id" ASC LIMIT 50`),
        this.database.$queryRaw<RetrievedProvision[]>(Prisma.sql`
          SELECT ${selectColumns}, MAX(1 - (e."embedding" <=> ${vector}::vector)) AS "score"
          FROM "document_embeddings" e
          JOIN "document_chunks" c ON c."id" = e."document_chunk_id"
          JOIN "document_provisions" p ON p."id" = c."document_provision_id"
          JOIN "document_versions" v ON v."id" = p."document_version_id"
          JOIN "documents" d ON d."id" = v."document_id"
          WHERE e."embedding_profile_id" = ${embeddingProfileId} AND ${filters}
          GROUP BY p."id", d."id", v."id", d."title", d."reference_number", d."document_type",
            p."provision_type", p."source_identifier", p."title", p."heading_path", p."language",
            p."content", p."content_hash"
          ORDER BY MAX(e."embedding" <=> ${vector}::vector), p."id" ASC LIMIT 50`),
      ]);
      const byProvision = new Map(
        [...keywordRows, ...semanticRows].map((row) => [row.provisionId, row]),
      );
      const fused = reciprocalRankFusion(
        keywordRows.map((row, rank) => ({
          id: row.provisionId,
          rank: rank + 1,
          score: Number(row.score),
        })),
        semanticRows.map((row, rank) => ({
          id: row.provisionId,
          rank: rank + 1,
          score: Number(row.score),
        })),
        100,
      );
      for (const item of fused) {
        const row = byProvision.get(item.id);
        if (!row) continue;
        const score = item.rrfScore + 1 / (100 + index);
        const existing = seeds.get(row.provisionId);
        if (!existing || score > Number(existing.score))
          seeds.set(row.provisionId, { ...row, score });
      }
      completedQueries += 1;
      const progress = 10 + Math.round((completedQueries / queries.length) * 25);
      await this.reportProgress(run.id, job, {
        phase: "retrieval",
        percent: progress,
        completed: completedQueries,
        total: queries.length,
        stage: "hybrid_search",
      });
      this.logger.info(
        {
          event: "regulatory_retrieval_query_finished",
          runId: run.id,
          jobId: job.id,
          queryIndex: index + 1,
          queryTotal: queries.length,
          keywordResults: keywordRows.length,
          semanticResults: semanticRows.length,
          uniqueSeeds: seeds.size,
          durationMs: Date.now() - queryStartedAt,
        },
        "regulatory retrieval query finished",
      );
    };
    let queryCursor = 0;
    const queryWorker = async (): Promise<void> => {
      for (;;) {
        if (queryCursor >= queries.length) return;
        const index = queryCursor;
        queryCursor += 1;
        await runQuery(index, queries[index]!);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(RETRIEVAL_QUERY_CONCURRENCY, queries.length) }, () =>
        queryWorker(),
      ),
    );
    const rankedSeeds = dedupeRegulatoryProvisions([...seeds.values()]);
    const documentScores = new Map<string, number>();
    for (const seed of rankedSeeds) {
      documentScores.set(
        seed.documentId,
        Math.max(documentScores.get(seed.documentId) ?? 0, Number(seed.score)),
      );
    }
    const documentIds = [...documentScores.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, positiveNumber("REGULATORY_RETRIEVAL_MAX_DOCUMENTS", 40))
      .map(([documentId]) => documentId);
    if (!documentIds.length) {
      this.logger.info(
        {
          event: "regulatory_retrieval_expansion_finished",
          runId: run.id,
          jobId: job.id,
          selectedDocuments: 0,
          eligibleProvisions: 0,
        },
        "regulatory document expansion finished",
      );
      return [];
    }

    const languageFilter = Prisma.join(run.languages.map((language) => Prisma.sql`${language}`));
    const documentFilter = Prisma.join(documentIds.map((documentId) => Prisma.sql`${documentId}`));
    const expanded = await this.database.$queryRaw<RetrievedProvision[]>(Prisma.sql`
      SELECT p."id" AS "provisionId", d."id" AS "documentId", v."id" AS "documentVersionId",
        d."title" AS "documentTitle", d."reference_number" AS "referenceNumber",
        CASE WHEN d."document_type" = 'standard' THEN 'standard' ELSE 'regulation' END AS "documentFamily",
        lower(p."provision_type"::text) AS "provisionType", p."source_identifier" AS "identifier",
        p."title" AS "title", p."heading_path" AS "headingPath", p."language" AS "language",
        p."content" AS "content", p."content_hash" AS "contentHash", 0.0 AS "score"
      FROM "document_provisions" p
      JOIN "document_versions" v ON v."id" = p."document_version_id"
      JOIN "documents" d ON d."id" = v."document_id"
      WHERE d."id" IN (${documentFilter}) AND d."current_version_id" = v."id"
        AND p."language" IN (${languageFilter})
      ORDER BY d."id", p."order_index"`);
    const combined = new Map(rankedSeeds.map((seed) => [seed.provisionId, seed]));
    for (const provision of expanded) {
      if (!isStructurallyEligibleProvision(provision)) continue;
      const siblingScore = (documentScores.get(provision.documentId) ?? 0) * 0.5;
      const existing = combined.get(provision.provisionId);
      if (!existing) combined.set(provision.provisionId, { ...provision, score: siblingScore });
    }
    const eligible = dedupeRegulatoryProvisions([...combined.values()])
      .filter(isStructurallyEligibleProvision)
      .slice(0, positiveNumber("REGULATORY_RETRIEVAL_MAX_PROVISIONS", 150));
    this.logger.info(
      {
        event: "regulatory_retrieval_expansion_finished",
        runId: run.id,
        jobId: job.id,
        selectedDocuments: documentIds.length,
        rankedSeeds: rankedSeeds.length,
        expandedProvisions: expanded.length,
        eligibleProvisions: eligible.length,
      },
      "regulatory document expansion finished",
    );
    return eligible;
  }

  // Cheap first pass over the wide, retrieval-scored pool of newly discovered provisions:
  // one batched, no-reasoning model call per group asks only "does this look applicable?"
  // instead of the full per-provision drafting+verification pipeline. A batch that errors,
  // or a provision the model didn't return a decision for, fails open (kept for full
  // review) so this stage can only ever save cost — it can never be why a real
  // requirement gets missed. See selectTriageSurvivors for that policy.
  private async triageAdditions(
    run: {
      id: string;
      clarificationRevision: number;
      profileSnapshot: { data: Prisma.JsonValue };
    },
    additions: CandidateInput[],
    job: Job<JobEnvelope>,
  ): Promise<{ survivors: CandidateInput[] }> {
    if (!additions.length) return { survivors: [] };
    const includeUnsure = llmSettings().triageIncludeUnsure;
    const batchSize = Math.round(positiveNumber("REGULATORY_TRIAGE_BATCH_SIZE", 25));
    // Triage only pays for itself when its NO is trustworthy, and a 600-character window was
    // often too little to see a provision's scope, so nearly everything came back UNSURE and
    // survived to full review. On the triage model a wider window costs a fraction of the
    // detailed analysis it avoids, so the excerpt buys decisiveness cheaply.
    const excerptChars = Math.round(positiveNumber("REGULATORY_TRIAGE_EXCERPT_CHARS", 1_500));
    const batches = batchForTriage(additions, batchSize);
    // Triage asks one three-way question per provision off a 600-character excerpt and emits no
    // reasoning tokens, so it runs on the cheaper model. Its ledger rows price off that model's
    // own rates, not the drafting model's.
    const model = regulatoryTriageModel();
    const limits = regulatoryModelLimits("triage");
    const decisions: TriageDecision[] = [];
    // Batches are independent triage questions: the only shared state a lane touches is the
    // `decisions` push (synchronous, no `await` inside it, so concurrent lanes cannot interleave
    // mid-write) and the cancellation flag below. Sequential batches used to serialize a
    // profile's worth of network round trips — including every rate-limit retry — before
    // classification could even begin.
    let cancelled = false;
    let completedBatches = 0;

    const processBatch = async (batchIndex: number, batch: CandidateInput[]): Promise<void> => {
      if (!(await this.stillCurrent(run.id))) {
        cancelled = true;
        return;
      }
      const prompt = regulatoryTriagePrompt.build({
        profileContext: run.profileSnapshot.data,
        batch: batch.map((candidate) => ({
          provisionId: candidate.provisionId,
          documentFamily: candidate.documentFamily,
          provisionType: candidate.provisionType,
          document: [candidate.referenceNumber, candidate.documentTitle]
            .filter(Boolean)
            .join(" — "),
          identifier: candidate.identifier,
          title: candidate.title,
          headingPath: candidate.headingPath,
          excerpt: candidate.content.slice(0, excerptChars),
        })),
      });

      let reservation: { ids: string[]; shares: number[] } | null = null;
      try {
        reservation = await this.reserveTriageBatchCall({
          runId: run.id,
          provisionIds: batch.map((candidate) => candidate.provisionId),
          clarificationRevision: run.clarificationRevision,
          attempt: 1,
          model,
          prompt,
          maxOutputTokens: limits.maxOutputTokens,
        });
      } catch (error) {
        if (!isMissingProvisionForeignKeyError(error)) throw error;
        this.logger.warn(
          {
            event: "regulatory_triage_batch_source_missing",
            runId: run.id,
            jobId: job.id,
            batchIndex: batchIndex + 1,
            batchTotal: batches.length,
          },
          "regulatory triage batch contained a provision deleted or reprocessed mid-run; its candidates proceed to full review",
        );
      }

      if (reservation) {
        const activeReservation = reservation;
        for (let rateLimitAttempt = 1; ; rateLimitAttempt += 1) {
          const callStartedAt = Date.now();
          const heartbeatContext = {
            runId: run.id,
            jobId: job.id,
            stage: "triage" as const,
            batchIndex: batchIndex + 1,
            batchTotal: batches.length,
            batchSize: batch.length,
            model,
          };
          const heartbeat = setInterval(() => {
            this.logger.info(
              {
                event: "regulatory_model_call_heartbeat",
                ...heartbeatContext,
                durationMs: Date.now() - callStartedAt,
              },
              "regulatory model call is still running",
            );
          }, MODEL_HEARTBEAT_INTERVAL_MS);
          heartbeat.unref();
          try {
            await acquireModelTokens(
              model,
              conservativeInputTokens(prompt) + limits.maxOutputTokens,
              regulatoryTokensPerMinute(),
            );
            const generated = await generateText({
              model: openAiProvider().responses(model),
              system: prompt.system,
              prompt: prompt.context,
              output: Output.object({ schema: triageBatchSchema }),
              timeout: limits.timeoutMs,
              maxOutputTokens: limits.maxOutputTokens,
              maxRetries: 0,
              providerOptions: regulatoryProviderOptions({
                // Triage is a yes/no/unsure sort against a short excerpt, so it gets the cheapest
                // reasoning the gpt-5 family offers. It is "minimal" rather than "none" because
                // the models this stage runs on reject "none" outright.
                reasoningEffort: "minimal",
                promptCacheKey: `regulatory-triage:${run.id}`,
              }),
              telemetry: { isEnabled: false },
            });
            const latencyMs = Date.now() - callStartedAt;
            const inputShares = splitReservedCost(
              generated.totalUsage.inputTokens ?? 0,
              batch.length,
            );
            const outputShares = splitReservedCost(
              generated.totalUsage.outputTokens ?? 0,
              batch.length,
            );
            const reasoningShares = splitReservedCost(
              generated.totalUsage.outputTokenDetails?.reasoningTokens ?? 0,
              batch.length,
            );
            const cachedInputShares = splitReservedCost(
              generated.totalUsage.inputTokenDetails?.cacheReadTokens ?? 0,
              batch.length,
            );
            for (const [index, id] of activeReservation.ids.entries()) {
              await this.settleModelCall(
                run.id,
                { id, model, reservedMicroUsd: activeReservation.shares[index]! },
                {
                  status: "SUCCEEDED",
                  inputTokens: inputShares[index]!,
                  cachedInputTokens: cachedInputShares[index]!,
                  outputTokens: outputShares[index]!,
                  reasoningTokens: reasoningShares[index]!,
                  latencyMs,
                },
              );
            }
            decisions.push(...normalizeTriageDecisions(batch, generated.output.decisions));
          } catch (error) {
            const timedOut = isTimeoutError(error);
            const rateLimited = !timedOut && isRateLimitError(error);
            const latencyMs = Date.now() - callStartedAt;
            const batchUsage = failureUsage(error);
            const failedInputShares = batchUsage
              ? splitReservedCost(batchUsage.inputTokens, batch.length)
              : null;
            const failedCachedShares = batchUsage
              ? splitReservedCost(batchUsage.cachedInputTokens ?? 0, batch.length)
              : null;
            const failedOutputShares = batchUsage
              ? splitReservedCost(batchUsage.outputTokens, batch.length)
              : null;
            for (const [index, id] of activeReservation.ids.entries()) {
              await this.settleModelCall(
                run.id,
                { id, model, reservedMicroUsd: activeReservation.shares[index]! },
                {
                  status: timedOut ? "TIMED_OUT" : "FAILED",
                  latencyMs,
                  errorCode: timedOut
                    ? "REGULATORY_MODEL_TIMEOUT"
                    : rateLimited
                      ? "REGULATORY_MODEL_RATE_LIMITED"
                      : "REGULATORY_MODEL_UNAVAILABLE",
                  usage:
                    failedInputShares && failedCachedShares && failedOutputShares
                      ? {
                          inputTokens: failedInputShares[index]!,
                          cachedInputTokens: failedCachedShares[index]!,
                          outputTokens: failedOutputShares[index]!,
                        }
                      : null,
                },
              );
            }
            if (rateLimited && rateLimitAttempt < RATE_LIMIT_MAX_ATTEMPTS) {
              const delayMs = jitteredDelay(
                parseRateLimitRetryDelayMs(error, RATE_LIMIT_FALLBACK_DELAY_MS),
              );
              this.logger.warn(
                {
                  event: "regulatory_triage_batch_rate_limited",
                  runId: run.id,
                  jobId: job.id,
                  batchIndex: batchIndex + 1,
                  batchTotal: batches.length,
                  rateLimitAttempt,
                  delayMs,
                },
                "regulatory triage batch rate limited; retrying after backoff",
              );
              clearInterval(heartbeat);
              await sleep(delayMs);
              continue;
            }
            this.logger.warn(
              {
                event: "regulatory_triage_batch_failed",
                runId: run.id,
                jobId: job.id,
                batchIndex: batchIndex + 1,
                batchTotal: batches.length,
                err: error,
              },
              "regulatory triage batch failed; its candidates proceed to full review",
            );
          } finally {
            clearInterval(heartbeat);
          }
          break;
        }
      }

      completedBatches += 1;
      await this.reportProgress(run.id, job, {
        phase: "triage",
        percent: regulatoryTriageProgress(completedBatches, batches.length),
        completed: completedBatches,
        total: batches.length,
        stage: "triage_batch_completed",
      });
    };

    let batchCursor = 0;
    const batchWorker = async (): Promise<void> => {
      for (;;) {
        if (cancelled) return;
        if (batchCursor >= batches.length) return;
        const batchIndex = batchCursor;
        batchCursor += 1;
        await processBatch(batchIndex, batches[batchIndex]!);
      }
    };
    const outcomes = await Promise.allSettled(
      Array.from({ length: Math.min(TRIAGE_CONCURRENCY, batches.length) }, () => batchWorker()),
    );
    const failure = outcomes.find(
      (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
    );
    if (failure) throw failure.reason;

    return { survivors: selectTriageSurvivors(additions, decisions, includeUnsure) };
  }

  private async classifyProvisions(
    run: {
      id: string;
      clarificationRevision: number;
      profileSnapshot: { data: Prisma.JsonValue };
      baseBaseline: {
        profileSnapshot: { data: Prisma.JsonValue };
        entries: Array<{
          id: string;
          provisionId: string;
          applicabilityRationale: string;
          requirementText: string | null;
        }>;
      } | null;
      scopeFacts: Array<{ key: string; question: string; answer: Prisma.JsonValue | null }>;
    },
    candidates: CandidateInput[],
    profileChanges: Array<{ key: string; previous: unknown; current: unknown }>,
    job: Job<JobEnvelope>,
  ): Promise<{ results: ClassifiedCandidate[] }> {
    if (!candidates.length) return { results: [] };
    const model = regulatoryPrimaryModel();
    const reasoningEffort = llmSettings().regulatoryReasoningEffort;
    const results: ClassifiedCandidate[] = [];
    const savedCandidates = await this.database.regulatoryApplicabilityCandidate.findMany({
      where: { runId: run.id, classificationRevision: run.clarificationRevision },
      select: {
        provisionId: true,
        suggestion: true,
        rationale: true,
        matchedProfileKeys: true,
        confidence: true,
        clarificationQuestion: true,
        requirementText: true,
        requirementStatus: true,
        requirementSupportingExcerpts: true,
        requirementIssues: true,
        requirementSource: true,
      },
    });
    const checkpoints = new Map(
      savedCandidates.map((candidate) => [candidate.provisionId, candidate]),
    );
    const generate = async <T extends z.ZodTypeAny>(
      prompt: { system: string; context: string },
      schema: T,
      context: {
        candidate: CandidateInput;
        candidateIndex: number;
        candidateTotal: number;
        attempt: number;
        stage: ClassificationModelStage;
      },
    ) => {
      const phase =
        context.attempt > 1
          ? "classification_retrying"
          : context.stage === "drafting"
            ? "classification_drafting"
            : "classification_verifying";
      const percent = regulatoryClassificationProgress(
        context.candidateIndex,
        context.candidateTotal,
      );
      await this.reportProgress(run.id, job, {
        phase,
        percent,
        completed: context.candidateIndex,
        total: context.candidateTotal,
        provisionId: context.candidate.provisionId,
        identifier: context.candidate.identifier,
        documentId: context.candidate.documentId,
        attempt: context.attempt,
        stage: context.stage,
      });
      const limits = regulatoryModelLimits(context.stage);
      const stageModel = context.stage === "verification" ? regulatoryVerificationModel() : model;
      const logContextBase = {
        runId: run.id,
        jobId: job.id,
        candidateIndex: context.candidateIndex + 1,
        candidateTotal: context.candidateTotal,
        provisionId: context.candidate.provisionId,
        identifier: context.candidate.identifier,
        documentId: context.candidate.documentId,
        language: context.candidate.language,
        stage: context.stage,
        attempt: context.attempt,
        model: stageModel,
        reasoningEffort,
        timeoutMs: limits.timeoutMs,
        maxOutputTokens: limits.maxOutputTokens,
      };

      // A rate limit is a same-request retry, distinct from the attempt/verifierFeedback
      // loop above (which redrafts with different content). Each try still reserves and
      // settles its own ledger row, so a rate-limited row and the eventual successful one
      // both stay individually auditable instead of one call silently swallowing retries.
      for (let rateLimitAttempt = 1; ; rateLimitAttempt += 1) {
        const reservation = await this.reserveModelCall({
          runId: run.id,
          provisionId: context.candidate.provisionId,
          clarificationRevision: run.clarificationRevision,
          stage: context.stage,
          attempt: context.attempt,
          model: stageModel,
          prompt,
          maxOutputTokens: limits.maxOutputTokens,
        });
        const callStartedAt = Date.now();
        const logContext = { ...logContextBase, reservedMicroUsd: reservation.reservedMicroUsd };
        this.logger.info(
          { event: "regulatory_model_call_started", ...logContext },
          "regulatory model call started",
        );
        const heartbeat = setInterval(() => {
          this.logger.info(
            {
              event: "regulatory_model_call_heartbeat",
              ...logContext,
              durationMs: Date.now() - callStartedAt,
            },
            "regulatory model call is still running",
          );
        }, MODEL_HEARTBEAT_INTERVAL_MS);
        heartbeat.unref();
        try {
          await acquireModelTokens(
            stageModel,
            conservativeInputTokens(prompt) + limits.maxOutputTokens,
            regulatoryTokensPerMinute(),
          );
          const generated = await generateText({
            model: openAiProvider().responses(stageModel),
            system: prompt.system,
            prompt: prompt.context,
            output: Output.object({ schema }),
            timeout: limits.timeoutMs,
            maxOutputTokens: limits.maxOutputTokens,
            maxRetries: 0,
            providerOptions: regulatoryProviderOptions({
              // Verification is a containment check that runs only after
              // validateRequirementDraft has already confirmed every excerpt is a verbatim
              // substring of the source, so it has almost nothing left to reason about. The
              // gpt-5 family rejects "none", so the floor here is "minimal".
              reasoningEffort: context.stage === "verification" ? "minimal" : reasoningEffort,
              promptCacheKey: `regulatory-${context.stage}:${run.id}`,
            }),
            telemetry: { isEnabled: false },
          });
          const callInputTokens = generated.totalUsage.inputTokens ?? 0;
          const callCachedInputTokens =
            generated.totalUsage.inputTokenDetails?.cacheReadTokens ?? 0;
          const callOutputTokens = generated.totalUsage.outputTokens ?? 0;
          const reasoningTokens = generated.totalUsage.outputTokenDetails?.reasoningTokens ?? 0;
          await this.settleModelCall(run.id, reservation, {
            status: "SUCCEEDED",
            inputTokens: callInputTokens,
            cachedInputTokens: callCachedInputTokens,
            outputTokens: callOutputTokens,
            reasoningTokens,
            latencyMs: Date.now() - callStartedAt,
          });
          this.logger.info(
            {
              event: "regulatory_model_call_finished",
              ...logContext,
              durationMs: Date.now() - callStartedAt,
              inputTokens: callInputTokens,
              outputTokens: callOutputTokens,
              reasoningTokens,
            },
            "regulatory model call finished",
          );
          return generated.output as z.infer<T>;
        } catch (error) {
          const timedOut = isTimeoutError(error);
          const rateLimited = !timedOut && isRateLimitError(error);
          await this.settleModelCall(run.id, reservation, {
            status: timedOut ? "TIMED_OUT" : "FAILED",
            latencyMs: Date.now() - callStartedAt,
            errorCode: timedOut
              ? "REGULATORY_MODEL_TIMEOUT"
              : rateLimited
                ? "REGULATORY_MODEL_RATE_LIMITED"
                : "REGULATORY_MODEL_UNAVAILABLE",
            usage: failureUsage(error),
          });
          if (rateLimited && rateLimitAttempt < RATE_LIMIT_MAX_ATTEMPTS) {
            const delayMs = jitteredDelay(
              parseRateLimitRetryDelayMs(error, RATE_LIMIT_FALLBACK_DELAY_MS),
            );
            this.logger.warn(
              {
                event: "regulatory_model_call_rate_limited",
                ...logContext,
                rateLimitAttempt,
                delayMs,
              },
              "regulatory model call rate limited; retrying after backoff",
            );
            await sleep(delayMs);
            continue;
          }
          this.logger.error(
            {
              event: "regulatory_model_call_failed",
              ...logContext,
              durationMs: Date.now() - callStartedAt,
              err: error,
            },
            "regulatory model call failed",
          );
          const message = error instanceof Error ? error.message : "Unknown model error";
          if (rateLimited) {
            throw new RegulatoryAnalysisError(
              "REGULATORY_MODEL_RATE_LIMITED",
              `Regulatory model ${stageModel} stayed rate limited past ${RATE_LIMIT_MAX_ATTEMPTS} attempts: ${message}`,
            );
          }
          throw new RegulatoryAnalysisError(
            "REGULATORY_MODEL_UNAVAILABLE",
            `Regulatory model ${stageModel} failed without fallback: ${message}`,
          );
        } finally {
          clearInterval(heartbeat);
        }
      }
    };

    let completedCount = 0;
    let cancelled = false;

    const processCandidate = async (
      candidateIndex: number,
      candidate: CandidateInput,
    ): Promise<void> => {
      const checkpoint = checkpoints.get(candidate.provisionId);
      if (checkpoint) {
        results.push({
          ...candidate,
          suggestion: checkpoint.suggestion,
          rationale: checkpoint.rationale,
          matchedProfileKeys: checkpoint.matchedProfileKeys,
          confidence: Number(checkpoint.confidence),
          clarificationQuestion: checkpoint.clarificationQuestion,
          requirementText: checkpoint.requirementText,
          requirementStatus: checkpoint.requirementStatus,
          requirementSupportingExcerpts: checkpoint.requirementSupportingExcerpts,
          requirementIssues: checkpoint.requirementIssues,
          requirementSource: checkpoint.requirementSource,
        });
        completedCount += 1;
        await this.reportProgress(run.id, job, {
          phase: "classification",
          percent: regulatoryClassificationProgress(completedCount, candidates.length),
          completed: completedCount,
          total: candidates.length,
          provisionId: candidate.provisionId,
          identifier: candidate.identifier,
          documentId: candidate.documentId,
          stage: "checkpoint_recovered",
        });
        return;
      }
      const provisionStartedAt = Date.now();
      this.logger.info(
        {
          event: "regulatory_provision_started",
          runId: run.id,
          jobId: job.id,
          candidateIndex: candidateIndex + 1,
          candidateTotal: candidates.length,
          provisionId: candidate.provisionId,
          identifier: candidate.identifier,
          documentId: candidate.documentId,
          referenceNumber: candidate.referenceNumber,
          language: candidate.language,
          changeType: candidate.changeType,
        },
        "regulatory provision analysis started",
      );
      const initialIssues = structuralIssues(candidate);
      if (candidate.content.length > 30_000) {
        initialIssues.push(
          "La disposition dépasse 30 000 caractères et ne peut pas être envoyée sans troncature.",
        );
      }
      if (initialIssues.length) {
        const blocked: ClassifiedCandidate = {
          ...candidate,
          suggestion: candidate.previousEntryId ? "APPLICABLE" : "TO_CONFIRM",
          rationale: "La qualité ou la structure de la source ne permet pas une analyse fiable.",
          matchedProfileKeys: [],
          confidence: 0,
          clarificationQuestion: null,
          requirementText: null,
          requirementStatus: "SOURCE_REVIEW_REQUIRED",
          requirementSupportingExcerpts: [],
          requirementIssues: [...new Set(initialIssues)],
          requirementSource: null,
        };
        results.push(blocked);
        await this.persistCandidate(run.id, run.clarificationRevision, blocked);
        completedCount += 1;
        await this.reportProgress(run.id, job, {
          phase: "classification",
          percent: regulatoryClassificationProgress(completedCount, candidates.length),
          completed: completedCount,
          total: candidates.length,
          provisionId: candidate.provisionId,
          identifier: candidate.identifier,
          documentId: candidate.documentId,
          stage: "source_quality_blocked",
        });
        this.logger.warn(
          {
            event: "regulatory_provision_finished",
            runId: run.id,
            jobId: job.id,
            candidateIndex: candidateIndex + 1,
            candidateTotal: candidates.length,
            provisionId: candidate.provisionId,
            identifier: candidate.identifier,
            documentId: candidate.documentId,
            status: blocked.requirementStatus,
            issueCount: blocked.requirementIssues.length,
            durationMs: Date.now() - provisionStartedAt,
          },
          "regulatory provision blocked by source quality",
        );
        return;
      }

      const previous = candidate.previousEntryId
        ? (run.baseBaseline?.entries ?? []).find((entry) => entry.id === candidate.previousEntryId)
        : null;
      let verifierFeedback: string[] = [];
      let classified: ClassifiedCandidate | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const prompt = regulatoryApplicabilityPrompt.build({
          profileContext: run.profileSnapshot.data,
          previousProfileContext: run.baseBaseline?.profileSnapshot.data ?? null,
          profileChanges,
          clarificationContext: run.scopeFacts.map(({ key, question, answer }) => ({
            key,
            question,
            answer,
          })),
          previousDecision: previous
            ? {
                previousEntryId: previous.id,
                decision: "APPLICABLE",
                rationale: previous.applicabilityRationale.slice(0, 800),
                requirementText: previous.requirementText,
              }
            : null,
          candidate: {
            provisionId: candidate.provisionId,
            previousEntryId: candidate.previousEntryId,
            changeType: candidate.changeType,
            documentFamily: candidate.documentFamily,
            provisionType: candidate.provisionType,
            document: [candidate.referenceNumber, candidate.documentTitle]
              .filter(Boolean)
              .join(" — "),
            identifier: candidate.identifier,
            title: candidate.title,
            content: candidate.content,
          },
          verifierFeedback,
        });
        const draft = await generate(prompt, classificationSchema, {
          candidate,
          candidateIndex,
          candidateTotal: candidates.length,
          attempt: attempt + 1,
          stage: "drafting",
        });
        const draftIssues = [
          ...draft.qualityIssues,
          ...(draft.sourceQuality === "BLOCKED"
            ? ["Le modèle a signalé une source inexploitable."]
            : []),
        ];
        const needsRequirement =
          draft.sourceQuality === "PASS" &&
          draft.normativeRequirement &&
          draft.suggestion !== "NOT_APPLICABLE";
        if (!needsRequirement) {
          classified = {
            ...candidate,
            suggestion: draft.suggestion,
            rationale: draft.rationale,
            matchedProfileKeys: draft.matchedProfileKeys,
            confidence: draft.confidence,
            clarificationQuestion: draft.clarificationQuestion,
            requirementText: draft.requirementText,
            requirementStatus:
              draft.sourceQuality === "BLOCKED" ? "SOURCE_REVIEW_REQUIRED" : "NOT_REQUIRED",
            requirementSupportingExcerpts: draft.supportingExcerpts,
            requirementIssues: [...new Set(draftIssues)],
            requirementSource: draft.requirementText ? "AI" : null,
          };
          break;
        }

        const deterministicIssues = validateRequirementDraft(
          candidate.content,
          draft.requirementText,
          draft.supportingExcerpts,
        );
        let verificationIssues = deterministicIssues;
        if (
          !verificationIssues.length &&
          draft.requirementText &&
          !isVerbatimRequirement(candidate.content, draft.requirementText)
        ) {
          const verificationPrompt = regulatoryRequirementVerificationPrompt.build({
            document: [candidate.referenceNumber, candidate.documentTitle]
              .filter(Boolean)
              .join(" — "),
            identifier: candidate.identifier,
            content: candidate.content,
            requirementText: draft.requirementText,
            supportingExcerpts: draft.supportingExcerpts,
          });
          // Verification is a comparison, not a drafting task, and its failure direction is
          // meant to be safe: an uncertain answer routes the candidate to human review rather
          // than publishing something unverified. That has to hold even when the call itself
          // fails outright (rate limits exhausted, or a model that reasoned through its whole
          // output budget without emitting the schema — NoOutputGeneratedError) — one candidate's
          // independent verifier hiccup must not discard every other candidate this run already
          // classified.
          let verification: z.infer<typeof verificationSchema> | null = null;
          try {
            verification = await generate(verificationPrompt, verificationSchema, {
              candidate,
              candidateIndex,
              candidateTotal: candidates.length,
              attempt: attempt + 1,
              stage: "verification",
            });
          } catch (error) {
            this.logger.warn(
              {
                event: "regulatory_verification_call_failed",
                runId: run.id,
                jobId: job.id,
                provisionId: candidate.provisionId,
                identifier: candidate.identifier,
                err: error,
              },
              "independent verification call failed; treating the requirement as unsupported instead of aborting the run",
            );
          }
          verificationIssues =
            verification === null
              ? [
                  "Le vérificateur indépendant n’a pas pu être interrogé ; vérification manuelle requise.",
                ]
              : verification.supported
                ? []
                : verification.issues.length
                  ? verification.issues
                  : ["Le vérificateur indépendant n’a pas confirmé le support de l’exigence."];
        }
        const allIssues = [...new Set([...draftIssues, ...verificationIssues])];
        classified = {
          ...candidate,
          suggestion: draft.suggestion,
          rationale: draft.rationale,
          matchedProfileKeys: draft.matchedProfileKeys,
          confidence: draft.confidence,
          clarificationQuestion: draft.clarificationQuestion,
          requirementText: draft.requirementText,
          requirementStatus: allIssues.length ? "SOURCE_REVIEW_REQUIRED" : "READY",
          requirementSupportingExcerpts: draft.supportingExcerpts,
          requirementIssues: allIssues,
          requirementSource: "AI",
        };
        if (!allIssues.length) break;
        verifierFeedback = allIssues;
      }
      if (classified) {
        results.push(classified);
        await this.persistCandidate(run.id, run.clarificationRevision, classified);
      }
      completedCount += 1;
      await this.reportProgress(run.id, job, {
        phase: "classification",
        percent: regulatoryClassificationProgress(completedCount, candidates.length),
        completed: completedCount,
        total: candidates.length,
        provisionId: candidate.provisionId,
        identifier: candidate.identifier,
        documentId: candidate.documentId,
        stage: "provision_completed",
      });
      this.logger.info(
        {
          event: "regulatory_provision_finished",
          runId: run.id,
          jobId: job.id,
          candidateIndex: candidateIndex + 1,
          candidateTotal: candidates.length,
          provisionId: candidate.provisionId,
          identifier: candidate.identifier,
          documentId: candidate.documentId,
          suggestion: classified?.suggestion,
          status: classified?.requirementStatus,
          issueCount: classified?.requirementIssues.length ?? 0,
          durationMs: Date.now() - provisionStartedAt,
        },
        "regulatory provision analysis finished",
      );
    };

    // Bounded worker pool: each lane pulls the next candidate off a shared cursor so up to
    // CLASSIFICATION_CONCURRENCY provisions are drafted/verified concurrently instead of one
    // at a time.
    let cursor = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        if (cancelled) return;
        if (!(await this.stillCurrent(run.id))) {
          cancelled = true;
          return;
        }
        if (cursor >= candidates.length) return;
        const candidateIndex = cursor;
        cursor += 1;
        const candidate = candidates[candidateIndex]!;
        try {
          await processCandidate(candidateIndex, candidate);
        } catch (error) {
          if (isMissingProvisionForeignKeyError(error)) {
            this.logger.warn(
              {
                event: "regulatory_provision_source_missing",
                runId: run.id,
                jobId: job.id,
                provisionId: candidate.provisionId,
                identifier: candidate.identifier,
                documentId: candidate.documentId,
              },
              "regulatory provision source was deleted or reprocessed mid-run; skipping it",
            );
            const blocked: ClassifiedCandidate = {
              ...candidate,
              suggestion: candidate.previousEntryId ? "APPLICABLE" : "TO_CONFIRM",
              rationale: "La disposition source a été supprimée ou modifiée pendant l'analyse.",
              matchedProfileKeys: [],
              confidence: 0,
              clarificationQuestion: null,
              requirementText: null,
              requirementStatus: "SOURCE_REVIEW_REQUIRED",
              requirementSupportingExcerpts: [],
              requirementIssues: [
                "La disposition source a été supprimée ou modifiée pendant l'analyse.",
              ],
              requirementSource: null,
            };
            results.push(blocked);
            await this.persistCandidate(run.id, run.clarificationRevision, blocked);
            completedCount += 1;
            await this.reportProgress(run.id, job, {
              phase: "classification",
              percent: regulatoryClassificationProgress(completedCount, candidates.length),
              completed: completedCount,
              total: candidates.length,
              provisionId: candidate.provisionId,
              identifier: candidate.identifier,
              documentId: candidate.documentId,
              stage: "provision_source_missing",
            });
            continue;
          }
          // A drafting call that stayed rate-limited past every retry, or one whose model
          // reasoned through its whole output budget without emitting the schema, is a failure
          // local to this one candidate — not evidence the run itself should stop. Marking it for
          // review and moving on keeps every other candidate this run already classified instead
          // of discarding all of it for one model hiccup, the same principle already applied to
          // the independent verifier's own call failures.
          if (
            error instanceof RegulatoryAnalysisError &&
            (error.code === "REGULATORY_MODEL_RATE_LIMITED" ||
              error.code === "REGULATORY_MODEL_UNAVAILABLE")
          ) {
            this.logger.warn(
              {
                event: "regulatory_candidate_classification_failed",
                runId: run.id,
                jobId: job.id,
                provisionId: candidate.provisionId,
                identifier: candidate.identifier,
                documentId: candidate.documentId,
                errorCode: error.code,
              },
              "drafting could not be completed for this candidate; marking it for manual review instead of aborting the run",
            );
            const blocked: ClassifiedCandidate = {
              ...candidate,
              suggestion: candidate.previousEntryId ? "APPLICABLE" : "TO_CONFIRM",
              rationale:
                "Le modèle n’a pas pu traiter cette disposition ; une nouvelle analyse ou une revue manuelle est nécessaire.",
              matchedProfileKeys: [],
              confidence: 0,
              clarificationQuestion: null,
              requirementText: candidate.previousRequirementText,
              requirementStatus: "SOURCE_REVIEW_REQUIRED",
              requirementSupportingExcerpts: candidate.previousRequirementSupportingExcerpts,
              requirementIssues: [
                "Le modèle n’a pas pu traiter cette disposition ; une nouvelle analyse ou une revue manuelle est nécessaire.",
              ],
              requirementSource: null,
            };
            results.push(blocked);
            await this.persistCandidate(run.id, run.clarificationRevision, blocked);
            completedCount += 1;
            await this.reportProgress(run.id, job, {
              phase: "classification",
              percent: regulatoryClassificationProgress(completedCount, candidates.length),
              completed: completedCount,
              total: candidates.length,
              provisionId: candidate.provisionId,
              identifier: candidate.identifier,
              documentId: candidate.documentId,
              stage: "candidate_classification_failed",
            });
            continue;
          }
          throw error;
        }
      }
    };

    const outcomes = await Promise.allSettled(
      Array.from({ length: Math.min(CLASSIFICATION_CONCURRENCY, candidates.length) }, () =>
        worker(),
      ),
    );
    const failure = outcomes.find(
      (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
    );
    if (failure) throw failure.reason;

    if (cancelled) {
      return { results };
    }
    await this.database.regulatoryAnalysisRun.update({
      where: { id: run.id },
      data: {
        model,
        promptKey: regulatoryApplicabilityPrompt.key,
        promptVersion: regulatoryApplicabilityPrompt.version,
      },
    });
    return { results };
  }

  private async persistCandidate(
    runId: string,
    clarificationRevision: number,
    candidate: ClassifiedCandidate,
  ): Promise<void> {
    const unchanged =
      candidate.changeType === "UNCHANGED" && candidate.requirementStatus === "READY";
    const systemExcluded =
      candidate.changeType === "ADDED" &&
      candidate.suggestion === "NOT_APPLICABLE" &&
      candidate.requirementStatus === "NOT_REQUIRED";
    const values = {
      previousEntryId: candidate.previousEntryId,
      changeType: candidate.changeType,
      changeSummary: candidate.changeSummary,
      requiresReview: !unchanged && !systemExcluded,
      suggestion: candidate.suggestion,
      rationale: candidate.rationale,
      matchedProfileKeys: candidate.matchedProfileKeys,
      confidence: candidate.confidence,
      clarificationQuestion: candidate.clarificationQuestion,
      requirementText: candidate.requirementText,
      requirementStatus: candidate.requirementStatus,
      requirementSupportingExcerpts: candidate.requirementSupportingExcerpts,
      requirementIssues: candidate.requirementIssues,
      requirementSource: candidate.requirementSource,
      decision: unchanged
        ? ("APPLICABLE" as const)
        : systemExcluded
          ? ("NOT_APPLICABLE" as const)
          : null,
      decisionSource: unchanged || systemExcluded ? ("SYSTEM" as const) : null,
      decisionNote: null,
      reviewedById: null,
      reviewedAt: null,
      classificationRevision: clarificationRevision,
    };
    await this.database.regulatoryApplicabilityCandidate.upsert({
      where: { runId_provisionId: { runId, provisionId: candidate.provisionId } },
      create: { runId, provisionId: candidate.provisionId, ...values },
      update: values,
    });
    const completed = await this.database.regulatoryApplicabilityCandidate.count({
      where: { runId, classificationRevision: clarificationRevision },
    });
    await this.database.regulatoryAnalysisRun.update({
      where: { id: runId },
      data: { completedProvisions: completed },
    });
  }

  private async persistCandidates(
    runId: string,
    clarificationRevision: number,
    candidates: ClassifiedCandidate[],
  ): Promise<void> {
    for (const candidate of candidates) {
      await this.persistCandidate(runId, clarificationRevision, candidate);
    }
  }

  private async awaitClarification(
    runId: string,
    watchId: string,
    questions: Array<ClassifiedCandidate & { clarificationQuestion: string }>,
  ): Promise<void> {
    await this.database.$transaction(async (tx) => {
      for (const item of questions) {
        await tx.regulatoryScopeFact.upsert({
          where: { runId_key: { runId, key: `candidate:${item.provisionId}` } },
          create: {
            runId,
            key: `candidate:${item.provisionId}`,
            question: item.clarificationQuestion,
          },
          update: { question: item.clarificationQuestion },
        });
      }
      await tx.regulatoryAnalysisRun.update({
        where: { id: runId },
        data: { status: "AWAITING_CLARIFICATION", phase: "clarification", progressPercent: 70 },
      });
      await tx.projectRegulatoryWatch.update({
        where: { id: watchId },
        data: { status: "AWAITING_CLARIFICATION" },
      });
    });
  }

  private async coverageGap(runId: string, watchId: string): Promise<void> {
    await this.database.$transaction([
      this.database.regulatoryAnalysisRun.update({
        where: { id: runId },
        data: {
          status: "READY_FOR_REVIEW",
          phase: "coverage-gap",
          progressPercent: 100,
          errorCode: "CORPUS_COVERAGE_GAP",
          errorMessage: "No exportable normative provision matched the project profile",
          completedAt: new Date(),
        },
      }),
      this.database.projectRegulatoryWatch.update({
        where: { id: watchId },
        data: { status: "REVIEW_REQUIRED", lastCheckedAt: new Date() },
      }),
    ]);
  }
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
