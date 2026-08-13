import { Processor, WorkerHost } from "@nestjs/bullmq";
import { openai } from "@ai-sdk/openai";
import { regulatoryApplicabilityPrompt } from "@qhse/ai";
import { RegulatoryAnalysisError, type JobEnvelope } from "@qhse/contracts";
import {
  createPrismaClient,
  Prisma,
  unindexedSearchableChunkFilter,
  type DatabaseClient,
} from "@qhse/database";
import { embed, generateText, Output } from "ai";
import type { Job } from "bullmq";
import { z } from "zod";

import { queueNames } from "../queues.js";

type ChangeType = "ADDED" | "UNCHANGED" | "MODIFIED" | "REMOVAL_PROPOSED";

type RetrievedProvision = {
  provisionId: string;
  documentId: string;
  documentVersionId: string;
  documentTitle: string;
  referenceNumber: string | null;
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
};

type ClassifiedCandidate = CandidateInput & {
  suggestion: "APPLICABLE" | "TO_CONFIRM" | "NOT_APPLICABLE";
  rationale: string;
  matchedProfileKeys: string[];
  confidence: number;
  clarificationQuestion: string | null;
};

const classificationSchema = z.object({
  results: z.array(
    z.object({
      provisionId: z.string(),
      suggestion: z.enum(["APPLICABLE", "TO_CONFIRM", "NOT_APPLICABLE"]),
      rationale: z.string().trim().min(1).max(2_000),
      matchedProfileKeys: z.array(z.string().max(120)).max(12),
      confidence: z.number().min(0).max(1),
      clarificationQuestion: z.string().trim().min(3).max(500).nullable(),
    }),
  ),
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
  return [...new Set(queries)].slice(0, 6);
}

@Processor(queueNames.regulatoryAnalysis, { concurrency: 2 })
export class RegulatoryAnalysisProcessor extends WorkerHost {
  private readonly database: DatabaseClient = createPrismaClient();

  async process(job: Job<JobEnvelope>) {
    const runId = typeof job.data.payload["runId"] === "string" ? job.data.payload["runId"] : null;
    if (!runId) throw new Error("Regulatory analysis runId is required");
    try {
      await this.analyze(runId, job);
      return { runId, processed: true };
    } catch (error) {
      const current = await this.database.regulatoryAnalysisRun.findUnique({
        where: { id: runId },
      });
      if (!current || current.status === "SUPERSEDED") return { runId, processed: false };
      const message = error instanceof Error ? error.message : "Unknown regulatory analysis error";
      const code = error instanceof RegulatoryAnalysisError ? error.code : "ANALYSIS_FAILED";
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
    return Boolean(run && !["SUPERSEDED", "FAILED", "COMPLETED"].includes(run.status));
  }

  private async analyze(runId: string, job: Job<JobEnvelope>): Promise<void> {
    if (process.env["NORMATIVE_RAG_ENABLED"] !== "true") {
      throw new RegulatoryAnalysisError(
        "NORMATIVE_RAG_DISABLED",
        "NORMATIVE_RAG_ENABLED must be true for the worker to run a regulatory analysis",
      );
    }
    if (!process.env["OPENAI_API_KEY"]) {
      throw new RegulatoryAnalysisError("OPENAI_KEY_MISSING", "OPENAI_API_KEY is required");
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
    const mandatoryKeys = new Set(mandatory.map(logicalKey));
    const previouslyExcludedIds = new Set(
      (run.baseBaseline?.analysisRun.candidates ?? [])
        .filter((candidate) => candidate.decision === "NOT_APPLICABLE")
        .map((candidate) => candidate.provisionId),
    );
    const additions: CandidateInput[] = discovered
      .filter(
        (candidate) =>
          !mandatoryKeys.has(logicalKey(candidate)) &&
          !previouslyExcludedIds.has(candidate.provisionId),
      )
      .slice(0, 40)
      .map((candidate) => ({
        ...candidate,
        previousEntryId: null,
        previousRationale: null,
        changeType: "ADDED",
        changeSummary: "Nouvelle disposition potentiellement applicable.",
      }));

    if (!(await this.stillCurrent(run.id))) return;
    await this.database.regulatoryAnalysisRun.update({
      where: { id: run.id },
      data: { phase: "classification", progressPercent: 50 },
    });
    await job.updateProgress({ phase: "classification", progress: 50 });

    if (!previousEntries.length && !additions.length) {
      await this.coverageGap(run.id, run.watchId);
      return;
    }

    const profileChanges = computeProfileChanges(
      run.baseBaseline?.profileSnapshot.data,
      run.profileSnapshot.data,
    );
    const deterministic = mandatory
      .filter((candidate) => candidate.changeType === "UNCHANGED" && profileChanges.length === 0)
      .map((candidate): ClassifiedCandidate => ({
        ...candidate,
        suggestion: "APPLICABLE",
        rationale: candidate.previousRationale ?? "Disposition conservée depuis la veille publiée.",
        matchedProfileKeys: [],
        confidence: 1,
        clarificationQuestion: null,
      }));
    const toClassify = [
      ...mandatory.filter(
        (candidate) => !deterministic.some((item) => item.provisionId === candidate.provisionId),
      ),
      ...additions,
    ];
    const classified = await this.classifyInBatches(run, toClassify, profileChanges);
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
    await this.persistCandidates(run.id, finalCandidates);
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
        candidate.changeType !== "UNCHANGED" &&
        !(candidate.changeType === "ADDED" && candidate.suggestion === "NOT_APPLICABLE"),
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
    run: { asOf: Date; languages: string[]; profileSnapshot: { data: Prisma.JsonValue } },
    embeddingProfileId: string,
    embeddingModel: string,
    job: Job<JobEnvelope>,
  ): Promise<RetrievedProvision[]> {
    const candidates = new Map<string, RetrievedProvision>();
    const queries = buildRegulatoryQueries(run.profileSnapshot.data);
    for (const [index, query] of queries.entries()) {
      const vectorResult = await embed({
        model: openai.embedding(embeddingModel),
        value: query,
        maxRetries: 3,
        providerOptions: { openai: { dimensions: 768 } },
        telemetry: { isEnabled: false },
      });
      if (vectorResult.embedding.length !== 768) throw new Error("Embedding dimensions mismatch");
      const vector = `[${vectorResult.embedding.join(",")}]`;
      const languageFilter = Prisma.join(run.languages.map((language) => Prisma.sql`${language}`));
      const rows = await this.database.$queryRaw<RetrievedProvision[]>(Prisma.sql`
        SELECT p."id" AS "provisionId", d."id" AS "documentId",
          v."id" AS "documentVersionId", d."title" AS "documentTitle",
          d."reference_number" AS "referenceNumber", p."source_identifier" AS "identifier",
          p."title" AS "title", p."heading_path" AS "headingPath", p."language" AS "language",
          p."content" AS "content", p."content_hash" AS "contentHash",
          MAX((1 - (e."embedding" <=> ${vector}::vector))
            + ts_rank_cd(c."search_vector", plainto_tsquery('simple', ${query}))) AS "score"
        FROM "document_embeddings" e
        JOIN "document_chunks" c ON c."id" = e."document_chunk_id"
        JOIN "document_provisions" p ON p."id" = c."document_provision_id"
        JOIN "document_versions" v ON v."id" = p."document_version_id"
        JOIN "documents" d ON d."id" = v."document_id"
        WHERE e."embedding_profile_id" = ${embeddingProfileId}
          AND d."current_version_id" = v."id" AND v."status" = 'PUBLISHED'
          AND v."validated_at" IS NOT NULL AND d."archived_at" IS NULL AND d."deleted_at" IS NULL
          AND d."visibility" IN ('ORGANIZATION_AVAILABLE', 'PUBLIC_REFERENCE')
          AND v."storage_allowed" AND v."extraction_allowed" AND v."embedding_allowed"
          AND v."ai_processing_allowed" AND v."external_provider_allowed"
          AND v."excerpt_display_allowed" AND v."export_allowed"
          AND p."language" IN (${languageFilter})
          AND (d."country_code" = 'MA' OR (d."document_type" = 'standard' AND d."country_code" IS NULL)
            OR (d."document_type" = 'standard' AND lower(coalesce(d."jurisdiction", '')) IN ('global', 'international', 'iso')))
          AND coalesce(v."effective_date", d."effective_date", v."published_at"::date) <= ${dateOnly(run.asOf)}::date
          AND (coalesce(v."expiration_date", d."expiration_date") IS NULL
            OR coalesce(v."expiration_date", d."expiration_date") > ${dateOnly(run.asOf)}::date)
        GROUP BY p."id", d."id", v."id", d."title", d."reference_number", p."source_identifier",
          p."title", p."heading_path", p."language", p."content", p."content_hash"
        ORDER BY "score" DESC, p."id" ASC LIMIT 50`);
      for (const row of rows) {
        const existing = candidates.get(row.provisionId);
        if (!existing || Number(row.score) > Number(existing.score))
          candidates.set(row.provisionId, row);
      }
      await job.updateProgress({
        phase: "retrieval",
        progress: 10 + Math.round(((index + 1) / queries.length) * 35),
      });
    }
    return [...candidates.values()].sort((a, b) => Number(b.score) - Number(a.score));
  }

  private async classifyInBatches(
    run: {
      id: string;
      profileSnapshot: { data: Prisma.JsonValue };
      baseBaseline: {
        profileSnapshot: { data: Prisma.JsonValue };
        entries: Array<{ id: string; provisionId: string; applicabilityRationale: string }>;
      } | null;
      scopeFacts: Array<{ key: string; question: string; answer: Prisma.JsonValue | null }>;
    },
    candidates: CandidateInput[],
    profileChanges: Array<{ key: string; previous: unknown; current: unknown }>,
  ): Promise<ClassifiedCandidate[]> {
    if (!candidates.length) return [];
    const model = process.env["OPENAI_REGULATORY_MODEL"] ?? "gpt-5-mini";
    const results: ClassifiedCandidate[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    for (let offset = 0; offset < candidates.length; offset += 20) {
      if (!(await this.stillCurrent(run.id))) return results;
      const batch = candidates.slice(offset, offset + 20);
      const previousEntryIds = new Set(
        batch.flatMap((candidate) =>
          candidate.previousEntryId ? [candidate.previousEntryId] : [],
        ),
      );
      const prompt = regulatoryApplicabilityPrompt.build({
        profileContext: run.profileSnapshot.data,
        previousProfileContext: run.baseBaseline?.profileSnapshot.data ?? null,
        profileChanges,
        clarificationContext: run.scopeFacts.map(({ key, question, answer }) => ({
          key,
          question,
          answer,
        })),
        previousDecisions: (run.baseBaseline?.entries ?? [])
          .filter((entry) => previousEntryIds.has(entry.id))
          .map((entry) => ({
            previousEntryId: entry.id,
            provisionId: entry.provisionId,
            decision: "APPLICABLE" as const,
            rationale: entry.applicabilityRationale.slice(0, 800),
          })),
        candidates: batch.map((candidate) => ({
          provisionId: candidate.provisionId,
          previousEntryId: candidate.previousEntryId,
          changeType: candidate.changeType,
          document: [candidate.referenceNumber, candidate.documentTitle]
            .filter(Boolean)
            .join(" — "),
          identifier: candidate.identifier,
          title: candidate.title,
          content: candidate.content.slice(0, 1_500),
        })),
      });
      const generated = await generateText({
        model: openai.responses(model),
        system: prompt.system,
        prompt: prompt.context,
        output: Output.object({ schema: classificationSchema }),
        maxRetries: 2,
        providerOptions: { openai: { store: false } },
        telemetry: { isEnabled: false },
      });
      inputTokens += generated.totalUsage.inputTokens ?? 0;
      outputTokens += generated.totalUsage.outputTokens ?? 0;
      const byId = new Map(batch.map((candidate) => [candidate.provisionId, candidate]));
      for (const item of generated.output.results) {
        const candidate = byId.get(item.provisionId);
        if (candidate) results.push({ ...candidate, ...item });
      }
    }
    await this.database.regulatoryAnalysisRun.update({
      where: { id: run.id },
      data: {
        model,
        promptKey: regulatoryApplicabilityPrompt.key,
        promptVersion: regulatoryApplicabilityPrompt.version,
        inputTokens,
        outputTokens,
      },
    });
    return results;
  }

  private async persistCandidates(runId: string, candidates: ClassifiedCandidate[]): Promise<void> {
    await this.database.$transaction(async (tx) => {
      await tx.regulatoryApplicabilityCandidate.deleteMany({ where: { runId } });
      for (const candidate of candidates) {
        const unchanged = candidate.changeType === "UNCHANGED";
        const systemExcluded =
          candidate.changeType === "ADDED" && candidate.suggestion === "NOT_APPLICABLE";
        await tx.regulatoryApplicabilityCandidate.create({
          data: {
            runId,
            provisionId: candidate.provisionId,
            previousEntryId: candidate.previousEntryId,
            changeType: candidate.changeType,
            changeSummary: candidate.changeSummary,
            requiresReview: !unchanged && !systemExcluded,
            suggestion: candidate.suggestion,
            rationale: candidate.rationale,
            matchedProfileKeys: candidate.matchedProfileKeys,
            confidence: candidate.confidence,
            decision: unchanged ? "APPLICABLE" : systemExcluded ? "NOT_APPLICABLE" : null,
            decisionSource: unchanged || systemExcluded ? "SYSTEM" : null,
          },
        });
      }
    });
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
