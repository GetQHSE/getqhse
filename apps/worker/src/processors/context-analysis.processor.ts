import { Processor, WorkerHost } from "@nestjs/bullmq";
import {
  contextSynthesisPrompt,
  languageModel,
  languageProviderOptions,
  llmSettings,
} from "@qhse/ai";
import type { LanguageProvider } from "@qhse/config";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";
import { smqContext } from "@qhse/domain";
import { createLogger } from "@qhse/observability";
import { Output, generateText } from "ai";
import type { Job } from "bullmq";
import { z } from "zod";

import { queueNames } from "../queues.js";
import { loadContextMaterial } from "./context-material.js";
import { acquireModelTokens } from "./regulatory-rate-limiter.js";
import { conservativeInputTokens, positiveNumber } from "./regulatory-model-cost.js";

const { canonicalKey, issueFingerprint } = smqContext;

/**
 * Step 3 of "Analyse des enjeux" (ISO 9001 §4.1) — issues synthesis.
 *
 * ESTABLISHED MATERIAL (validated profile + declared internal context +
 * persisted external factors + published regulatory register) → STRICT JSON
 * SYNTHESIS → EVIDENCE BINDING → CROSS-RUN IDENTITY → PERSISTENCE.
 *
 * No web search happens here: the model may only reason on material the
 * platform already persisted. Every ContextIssue lands with review_status
 * PENDING and sourceKind AI — nothing here is ever created as already
 * reviewed; that is applyIssueOverride's and createManualIssue's job alone.
 */

const rawIssueSchema = z.object({
  origin: z.enum(["internal", "external"]),
  categoryKey: z.string(),
  categoryLabel: z.string(),
  title: z.string(),
  description: z.string(),
  reasoning: z.string(),
  nature: z.enum(["force", "faiblesse", "opportunite", "menace"]),
  impactQuality: z.string().nullable(),
  impactCustomerSatisfaction: z.string().nullable(),
  impactOverall: z.string().nullable(),
  scoreInfluenceObjectives: z.number(),
  scoreInfluenceQuality: z.number(),
  scoreInfluenceCustomer: z.number(),
  confidence: z.number(),
  recommendedPriority: z.boolean(),
  evidence: z.array(
    z.object({
      sourceType: z.string(),
      reference: z.string().nullable(),
      excerpt: z.string(),
    }),
  ),
});
const synthesisSchema = z.object({ issues: z.array(rawIssueSchema) });

function contextTokensPerMinute(): number {
  return positiveNumber("CONTEXT_TOKENS_PER_MINUTE", 200_000);
}
/** Same pair used for the profile-chat structured reasoning: this call, like
 * that one, reasons over already-collected material with no web search. */
function contextSynthesisProvider(): LanguageProvider {
  return llmSettings().profileProvider;
}
function contextSynthesisModel(): string {
  return llmSettings().profileModel;
}

function clamp5(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : 1;
}
function clamp01(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
}

/** Every issue must cite at least one non-empty piece of evidence copied from
 * the material supplied — an issue with no real citation is dropped rather
 * than persisted unsupported. */
export function sanitizeSynthesizedIssues<
  T extends { title: string; description: string; evidence: { excerpt: string }[] },
>(issues: T[]): T[] {
  return issues.filter(
    (issue) =>
      issue.title.trim() &&
      issue.description.trim() &&
      issue.evidence.some((item) => item.excerpt.trim()),
  );
}

@Processor(queueNames.contextAnalysis, { concurrency: 2 })
export class ContextAnalysisProcessor extends WorkerHost {
  private readonly database: DatabaseClient = createPrismaClient();
  private readonly logger = createLogger({ base: { service: "qhse-worker" } });

  async process(job: Job<{ payload: { runId: string } }>): Promise<void> {
    const runId = job.data.payload.runId;
    const run = await this.database.contextAnalysisRun.findUnique({ where: { id: runId } });
    if (!run) return;

    const fail = async (message: string): Promise<void> => {
      await this.database.contextAnalysisRun.update({
        where: { id: runId },
        data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
      });
    };

    const { project, method, digest, internalCompleted, language } = await loadContextMaterial(
      this.database,
      run.projectId,
    );
    if (!method) {
      return fail("Choisissez d’abord la méthode d’analyse SWOT ou PESTEL.");
    }
    if (!internalCompleted) {
      return fail("Le contexte interne (étape 1) doit être validé avant la synthèse des enjeux.");
    }

    // Latest COMPLETED external research run for this project.
    const externalRun = await this.database.contextExternalResearchRun.findFirst({
      where: { projectId: project.id, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
    });
    const factors = externalRun
      ? await this.database.contextExternalFactor.findMany({
          where: { runId: externalRun.id },
          include: { sources: true },
        })
      : [];
    if (factors.length === 0) {
      return fail(
        "Aucun facteur externe documenté n'est disponible : lancez d'abord l'analyse externe (étape 2).",
      );
    }

    const externalMaterial = factors
      .map((factor, index) =>
        [
          `${index + 1}. [${factor.categoryLabel}] ${factor.title}`,
          factor.description ? `   Description : ${factor.description}` : null,
          `   Lien avec l'organisation : ${factor.relevanceToCompany ?? "—"}`,
          factor.influenceOnObjectives
            ? `   Influence objectifs : ${factor.influenceOnObjectives}`
            : null,
          factor.influenceOnQuality ? `   Influence qualité : ${factor.influenceOnQuality}` : null,
          factor.influenceOnCustomerSatisfaction
            ? `   Influence satisfaction client : ${factor.influenceOnCustomerSatisfaction}`
            : null,
          `   Orientation : ${factor.orientation ?? "incertain"} — solidité des preuves : ${factor.evidenceStrength ?? "faible"}`,
          factor.geographicScope ? `   Portée : ${factor.geographicScope}` : null,
          `   Sources : ${factor.sources
            .map((source) => source.url)
            .filter(Boolean)
            .join(", ")}`,
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n\n");

    await this.database.contextAnalysisRun.update({
      where: { id: runId },
      data: { status: "RUNNING", startedAt: new Date(), methodologyVersion: "issues-v2" },
    });

    const provider = contextSynthesisProvider();
    const model = contextSynthesisModel();

    try {
      const prompt = contextSynthesisPrompt.build({
        digest,
        externalMaterial,
        method,
        language,
      });
      await acquireModelTokens(
        `${provider}:${model}`,
        conservativeInputTokens(prompt) + 6_000,
        contextTokensPerMinute(),
      );
      const result = await generateText({
        model: languageModel({ provider, model }),
        system: prompt.system,
        prompt: prompt.context,
        output: Output.object({ schema: synthesisSchema }),
        timeout: llmSettings().regulatoryTimeoutMs,
        maxOutputTokens: 12_000,
        maxRetries: 2,
        // The foundation runs Gemini at 0.15; OpenAI reasoning models reject temperature.
        ...(provider === "google" ? { temperature: 0.15 } : {}),
        providerOptions: languageProviderOptions(provider, { model }),
        telemetry: { isEnabled: false },
      });
      const { issues: rawIssues } = synthesisSchema.parse(result.output);
      const sanitized = sanitizeSynthesizedIssues(rawIssues);
      if (sanitized.length === 0) {
        return fail(
          "Aucun enjeu suffisamment étayé n'a pu être produit à partir du matériel disponible. Le résultat est volontairement vide plutôt qu'approximatif.",
        );
      }

      const factorByKey = new Map<string, string>();
      for (const factor of factors) {
        const key = canonicalKey(factor.title);
        if (key && !factorByKey.has(key)) factorByKey.set(key, factor.id);
      }

      // Cross-run identity: previous issues of the SAME project only.
      const previousRows = await this.database.contextIssue.findMany({
        where: { projectId: project.id },
        select: { id: true, issueFingerprint: true },
        orderBy: { createdAt: "desc" },
        take: 1_000,
      });
      const previousByFingerprint = new Map<string, string>();
      for (const row of previousRows) {
        if (!previousByFingerprint.has(row.issueFingerprint)) {
          previousByFingerprint.set(row.issueFingerprint, row.id);
        }
      }

      let issuesCreated = 0;
      let internalCount = 0;
      let externalCount = 0;
      let evidenceCreated = 0;
      const seen = new Set<string>();
      const now = new Date();

      for (const issue of sanitized) {
        const origin = issue.origin === "external" ? "EXTERNAL" : "INTERNAL";
        const key = canonicalKey(issue.title, issue.categoryLabel);
        if (!key) continue;
        const fingerprint = await issueFingerprint(project.id, origin, key);
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        const previousId = previousByFingerprint.get(fingerprint) ?? null;

        const scores = {
          influenceObjectives: clamp5(issue.scoreInfluenceObjectives),
          influenceQuality: clamp5(issue.scoreInfluenceQuality),
          influenceCustomer: clamp5(issue.scoreInfluenceCustomer),
        };
        const overall = Math.round(
          (scores.influenceObjectives + scores.influenceQuality + scores.influenceCustomer) / 3,
        );

        const created = await this.database.contextIssue.create({
          data: {
            runId,
            projectId: project.id,
            previousIssueId: previousId,
            issueFingerprint: fingerprint,
            canonicalKey: key,
            comparisonStatus: previousId ? "recurrent" : "new",
            aiOrigin: origin,
            aiCategoryKey: issue.categoryKey.trim().toLowerCase().replace(/\s+/g, "_") || "autre",
            aiCategoryLabel: issue.categoryLabel.trim() || null,
            aiTitle: issue.title.trim(),
            aiDescription: issue.description.trim(),
            aiReasoning: issue.reasoning.trim() || null,
            aiNature: issue.nature,
            aiImpactQuality: issue.impactQuality?.trim() || null,
            aiImpactCustomerSatisfaction: issue.impactCustomerSatisfaction?.trim() || null,
            aiImpactOverall: issue.impactOverall?.trim() || null,
            aiScores: { ...scores, overall },
            aiConfidence: clamp01(issue.confidence),
            aiRecommendedPriority: Boolean(issue.recommendedPriority),
            aiModel: model,
            aiGeneratedAt: now,
            reviewStatus: "PENDING",
            sourceKind: "AI",
          },
        });
        issuesCreated += 1;
        if (origin === "INTERNAL") internalCount += 1;
        else externalCount += 1;

        for (const evidence of issue.evidence.slice(0, 8)) {
          const excerpt = evidence.excerpt.trim();
          if (!excerpt) continue;
          const factorId = evidence.reference
            ? (factorByKey.get(canonicalKey(evidence.reference)) ?? null)
            : null;
          await this.database.contextIssueEvidence.create({
            data: {
              issueId: created.id,
              sourceType: evidence.sourceType.trim() || "analysis_material",
              originKind: "SYSTEM",
              sourceRefTable: factorId ? "context_external_factors" : null,
              sourceRefId: factorId,
              excerpt,
              metadata: { reference: evidence.reference ?? null, runId },
            },
          });
          evidenceCreated += 1;
        }
      }

      if (issuesCreated === 0) {
        return fail(
          "Les enjeux identifiés n'ont pas pu être enregistrés. Aucun résultat approximatif n'a été conservé.",
        );
      }

      await this.database.contextAnalysisRun.update({
        where: { id: runId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          summary: {
            issuesCreated,
            internalCount,
            externalCount,
            evidenceCreated,
            externalRunId: externalRun?.id ?? null,
            analysisMethod: method,
            model,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        { event: "context_analysis_failed", runId, err: error },
        "context synthesis failed",
      );
      await fail(
        "La synthèse des enjeux a échoué avant d'aboutir. Aucun résultat n'a été enregistré, vous pouvez relancer.",
      );
    }
  }
}
