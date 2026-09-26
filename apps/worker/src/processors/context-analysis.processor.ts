import { Processor, WorkerHost } from "@nestjs/bullmq";
import {
  contextInternalIssuesPrompt,
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
import { loadContextMaterial, sameMethods } from "./context-material.js";
import { acquireModelTokens } from "./regulatory-rate-limiter.js";
import { conservativeInputTokens, positiveNumber } from "./regulatory-model-cost.js";

const { canonicalKey, issueFingerprint } = smqContext;

/**
 * "Analyse des enjeux" (ISO 9001 §4.1), as the demo template runs it:
 *
 * - INTERNAL run (tab 1, "Contexte interne"): the declared internal context
 *   becomes forces and faiblesses, each tied to the declared fact it comes from.
 * - SYNTHESIS run (tab 3, "Synthèse des enjeux"): the internal issues retained
 *   in tab 1 are pre-evaluated (impact × capacité de maîtrise) without being
 *   rewritten, and the external issues are identified from the factors of tab 2
 *   and pre-evaluated the same way.
 *
 * No web search happens here: the model only reasons on material the platform
 * already persisted. Every ContextIssue lands PENDING with sourceKind AI;
 * reviewing is applyIssueOverride's and validateSynthesis's job alone.
 */

type PromptMessages = { system: string; context: string };

const evidenceSchema = z.object({
  sourceType: z.string(),
  reference: z.string().nullable(),
  excerpt: z.string(),
});

const internalIssuesSchema = z.object({
  issues: z.array(
    z.object({
      categoryKey: z.string(),
      categoryLabel: z.string(),
      title: z.string(),
      description: z.string(),
      reasoning: z.string(),
      nature: z.enum(["force", "faiblesse"]),
      fact: z.string(),
      confidence: z.number(),
      evidence: z.array(evidenceSchema),
    }),
  ),
});

const synthesisSchema = z.object({
  internalRatings: z.array(z.object({ ref: z.string(), impact: z.number(), mastery: z.number() })),
  externalIssues: z.array(
    z.object({
      categoryKey: z.string(),
      categoryLabel: z.string(),
      title: z.string(),
      description: z.string(),
      reasoning: z.string(),
      nature: z.enum(["opportunite", "menace"]),
      impact: z.number(),
      mastery: z.number(),
      confidence: z.number(),
      evidence: z.array(evidenceSchema),
    }),
  ),
});

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

/** An unusable rating is left unset (the user rates it) rather than guessed. */
function clamp3(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(3, Math.max(1, Math.round(n))) : undefined;
}
function clamp01(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
}
function categoryKeyOf(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_") || "autre";
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

type RetainedIssue = {
  title: string;
  description: string | null;
  nature: string | null;
  categoryLabel: string | null;
};

/** The retained internal issues as the synthesis prompt reads them: I1, I2, … */
export function internalIssuesMaterial(issues: RetainedIssue[]): string {
  return issues
    .map((issue, index) =>
      [
        `I${index + 1}. [${issue.nature ?? "—"}${issue.categoryLabel ? ` · ${issue.categoryLabel}` : ""}] ${issue.title}`,
        issue.description ? `   ${issue.description}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
}

@Processor(queueNames.contextAnalysis, { concurrency: 2 })
export class ContextAnalysisProcessor extends WorkerHost {
  private readonly database: DatabaseClient = createPrismaClient();
  private readonly logger = createLogger({ base: { service: "qhse-worker" } });

  async process(job: Job<{ payload: { runId: string } }>): Promise<void> {
    const runId = job.data.payload.runId;
    const run = await this.database.contextAnalysisRun.findUnique({ where: { id: runId } });
    if (!run) return;
    if (run.kind === "INTERNAL") return this.deduceInternalIssues(runId, run.projectId);
    return this.synthesize(runId, run.projectId);
  }

  private async fail(runId: string, message: string): Promise<void> {
    await this.database.contextAnalysisRun.update({
      where: { id: runId },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
  }

  private async generate<T>(prompt: PromptMessages, schema: z.ZodType<T>, extraTokens: number) {
    const provider = contextSynthesisProvider();
    const model = contextSynthesisModel();
    await acquireModelTokens(
      `${provider}:${model}`,
      conservativeInputTokens(prompt) + extraTokens,
      contextTokensPerMinute(),
    );
    const result = await generateText({
      model: languageModel({ provider, model }),
      system: prompt.system,
      prompt: prompt.context,
      output: Output.object({ schema }),
      timeout: llmSettings().regulatoryTimeoutMs,
      maxOutputTokens: 12_000,
      maxRetries: 2,
      // The foundation runs Gemini at 0.15; OpenAI reasoning models reject temperature.
      ...(provider === "google" ? { temperature: 0.15 } : {}),
      providerOptions: languageProviderOptions(provider, { model }),
      telemetry: { isEnabled: false },
    });
    return { output: schema.parse(result.output), model };
  }

  /** Cross-run identity: previous issues of the SAME project only. */
  private async previousByFingerprint(projectId: string): Promise<Map<string, string>> {
    const rows = await this.database.contextIssue.findMany({
      where: { projectId },
      select: { id: true, issueFingerprint: true },
      orderBy: { createdAt: "desc" },
      take: 1_000,
    });
    const byFingerprint = new Map<string, string>();
    for (const row of rows) {
      if (!byFingerprint.has(row.issueFingerprint)) byFingerprint.set(row.issueFingerprint, row.id);
    }
    return byFingerprint;
  }

  /* ------------------------------ tab 1 ------------------------------ */

  private async deduceInternalIssues(runId: string, projectId: string): Promise<void> {
    const { project, digest, internalCompleted, language } = await loadContextMaterial(
      this.database,
      projectId,
    );
    if (!internalCompleted) {
      return this.fail(runId, "Complétez et validez d'abord les questions du contexte interne.");
    }

    await this.database.contextAnalysisRun.update({
      where: { id: runId },
      data: { status: "RUNNING", startedAt: new Date(), methodologyVersion: "internal-issues-v1" },
    });

    try {
      const { output, model } = await this.generate(
        contextInternalIssuesPrompt.build({ digest, language }),
        internalIssuesSchema,
        4_000,
      );
      const sanitized = sanitizeSynthesizedIssues(output.issues);
      if (sanitized.length === 0) {
        return this.fail(
          runId,
          "Aucun enjeu interne suffisamment étayé n'a pu être déduit des informations déclarées. Complétez le contexte interne puis relancez.",
        );
      }

      const previous = await this.previousByFingerprint(project.id);
      const seen = new Set<string>();
      const now = new Date();
      let issuesCreated = 0;

      for (const issue of sanitized) {
        const key = canonicalKey(issue.title, issue.categoryLabel);
        if (!key) continue;
        const fingerprint = await issueFingerprint(project.id, "INTERNAL", key);
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        const previousId = previous.get(fingerprint) ?? null;

        const created = await this.database.contextIssue.create({
          data: {
            runId,
            projectId: project.id,
            previousIssueId: previousId,
            issueFingerprint: fingerprint,
            canonicalKey: key,
            comparisonStatus: previousId ? "recurrent" : "new",
            aiOrigin: "INTERNAL",
            aiCategoryKey: categoryKeyOf(issue.categoryKey),
            aiCategoryLabel: issue.categoryLabel.trim() || null,
            aiTitle: issue.title.trim(),
            aiDescription: issue.description.trim(),
            aiReasoning: issue.reasoning.trim() || null,
            aiNature: issue.nature,
            aiScores: {},
            aiConfidence: clamp01(issue.confidence),
            aiModel: model,
            aiGeneratedAt: now,
            reviewStatus: "PENDING",
            sourceKind: "AI",
          },
        });
        issuesCreated += 1;

        // The declared fact comes first: it is what the card shows as "Fait utilisé".
        const fact = issue.fact.trim();
        const evidence = [
          ...(fact ? [{ sourceType: "declared_fact", reference: null, excerpt: fact }] : []),
          ...issue.evidence.slice(0, 6),
        ];
        for (const item of evidence) {
          const excerpt = item.excerpt.trim();
          if (!excerpt) continue;
          await this.database.contextIssueEvidence.create({
            data: {
              issueId: created.id,
              sourceType: item.sourceType.trim() || "internal_input",
              originKind: "SYSTEM",
              excerpt,
              metadata: { reference: item.reference ?? null, runId },
            },
          });
        }
      }

      await this.database.contextAnalysisRun.update({
        where: { id: runId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          summary: { issuesCreated, internalCount: issuesCreated, externalCount: 0, model },
        },
      });
    } catch (error) {
      this.logger.error(
        { event: "context_internal_issues_failed", runId, err: error },
        "context internal issues failed",
      );
      await this.fail(
        runId,
        "La déduction des enjeux internes a échoué avant d'aboutir. Aucun résultat n'a été enregistré, vous pouvez relancer.",
      );
    }
  }

  /* ------------------------------ tab 3 ------------------------------ */

  private async synthesize(runId: string, projectId: string): Promise<void> {
    const { project, methods, digest, internalCompleted, language } = await loadContextMaterial(
      this.database,
      projectId,
    );
    if (!internalCompleted) {
      return this.fail(
        runId,
        "Le contexte interne (étape 1) doit être complété avant la synthèse.",
      );
    }

    // Internal issues: the ones retained in tab 1, with their effective (corrected) values.
    const internalRun = await this.database.contextAnalysisRun.findFirst({
      where: { projectId: project.id, kind: "INTERNAL", status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
    });
    const retained = internalRun
      ? await this.database.contextIssue.findMany({
          where: { runId: internalRun.id, reviewStatus: { in: ["VALIDATED", "MODIFIED"] } },
          include: { evidence: true },
          orderBy: { createdAt: "asc" },
        })
      : [];
    if (retained.length === 0) {
      return this.fail(
        runId,
        "Validez au moins un enjeu interne à l'étape 1 (Contexte interne) : la synthèse part des enjeux retenus.",
      );
    }

    // External factors: the latest analysis, made with the methods selected now.
    const externalRun = await this.database.contextExternalResearchRun.findFirst({
      where: { projectId: project.id, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
    });
    const externalMethods = (externalRun?.summary as { analysisMethods?: unknown } | null)
      ?.analysisMethods;
    if (!externalRun || !sameMethods(externalMethods, methods)) {
      return this.fail(
        runId,
        "Lancez d'abord l'analyse externe (étape 2) avec les méthodes sélectionnées : la synthèse s'appuie sur ses résultats.",
      );
    }
    const factors = await this.database.contextExternalFactor.findMany({
      where: { runId: externalRun.id },
      include: { sources: true },
    });
    if (factors.length === 0) {
      return this.fail(
        runId,
        "Aucun facteur externe documenté n'est disponible : relancez l'analyse externe (étape 2).",
      );
    }

    const internalIssues = retained.map((issue) => ({
      source: issue,
      title: issue.title ?? issue.aiTitle,
      description: issue.description ?? issue.aiDescription,
      nature: issue.nature ?? issue.aiNature,
      categoryKey: issue.categoryKey ?? issue.aiCategoryKey,
      categoryLabel: issue.categoryLabel ?? issue.aiCategoryLabel,
    }));
    const externalMaterial = factors
      .map((factor, index) =>
        [
          `${index + 1}. [${factor.categoryLabel}] ${factor.title}`,
          factor.description ? `   Description : ${factor.description}` : null,
          `   Lien avec l'organisation : ${factor.relevanceToCompany ?? "—"}`,
          factor.influenceOnQuality ? `   Influence qualité : ${factor.influenceOnQuality}` : null,
          factor.influenceOnCustomerSatisfaction
            ? `   Influence satisfaction client : ${factor.influenceOnCustomerSatisfaction}`
            : null,
          `   Orientation : ${factor.orientation ?? "incertain"} — solidité des preuves : ${factor.evidenceStrength ?? "faible"}`,
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
      data: { status: "RUNNING", startedAt: new Date(), methodologyVersion: "issues-v3" },
    });

    try {
      const { output, model } = await this.generate(
        contextSynthesisPrompt.build({
          digest,
          internalIssues: internalIssuesMaterial(internalIssues),
          externalMaterial,
          methods,
          language,
        }),
        synthesisSchema,
        8_000,
      );
      const ratings = new Map(
        output.internalRatings.map((rating) => [rating.ref.trim().toUpperCase(), rating]),
      );
      const external = sanitizeSynthesizedIssues(output.externalIssues);

      const factorByKey = new Map<string, string>();
      for (const factor of factors) {
        const key = canonicalKey(factor.title);
        if (key && !factorByKey.has(key)) factorByKey.set(key, factor.id);
      }
      const previous = await this.previousByFingerprint(project.id);
      const seen = new Set<string>();
      const now = new Date();
      let internalCount = 0;
      let externalCount = 0;
      let evidenceCreated = 0;

      // 1. The retained internal issues, as they stand after the tab 1 review.
      for (const [index, issue] of internalIssues.entries()) {
        const rating = ratings.get(`I${index + 1}`);
        const created = await this.database.contextIssue.create({
          data: {
            runId,
            projectId: project.id,
            previousIssueId: issue.source.id,
            issueFingerprint: issue.source.issueFingerprint,
            canonicalKey: issue.source.canonicalKey,
            comparisonStatus: "retained",
            aiOrigin: "INTERNAL",
            aiCategoryKey: issue.categoryKey,
            aiCategoryLabel: issue.categoryLabel,
            aiTitle: issue.title,
            aiDescription: issue.description,
            aiReasoning: issue.source.aiReasoning,
            aiNature: issue.nature,
            aiScores: { impact: clamp3(rating?.impact), mastery: clamp3(rating?.mastery) },
            aiConfidence: issue.source.aiConfidence,
            aiModel: model,
            aiGeneratedAt: now,
            reviewStatus: "PENDING",
            sourceKind: issue.source.sourceKind,
          },
        });
        seen.add(issue.source.issueFingerprint);
        internalCount += 1;
        for (const item of issue.source.evidence) {
          await this.database.contextIssueEvidence.create({
            data: {
              issueId: created.id,
              sourceType: item.sourceType,
              originKind: item.originKind,
              sourceRefTable: item.sourceRefTable,
              sourceRefId: item.sourceRefId,
              sourceUrl: item.sourceUrl,
              excerpt: item.excerpt,
              metadata: { reference: null, runId, copiedFromEvidenceId: item.id },
            },
          });
          evidenceCreated += 1;
        }
      }

      // 2. The external issues identified from the documented factors.
      for (const issue of external) {
        const key = canonicalKey(issue.title, issue.categoryLabel);
        if (!key) continue;
        const fingerprint = await issueFingerprint(project.id, "EXTERNAL", key);
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        const previousId = previous.get(fingerprint) ?? null;

        const created = await this.database.contextIssue.create({
          data: {
            runId,
            projectId: project.id,
            previousIssueId: previousId,
            issueFingerprint: fingerprint,
            canonicalKey: key,
            comparisonStatus: previousId ? "recurrent" : "new",
            aiOrigin: "EXTERNAL",
            aiCategoryKey: categoryKeyOf(issue.categoryKey),
            aiCategoryLabel: issue.categoryLabel.trim() || null,
            aiTitle: issue.title.trim(),
            aiDescription: issue.description.trim(),
            aiReasoning: issue.reasoning.trim() || null,
            aiNature: issue.nature,
            aiScores: { impact: clamp3(issue.impact), mastery: clamp3(issue.mastery) },
            aiConfidence: clamp01(issue.confidence),
            aiModel: model,
            aiGeneratedAt: now,
            reviewStatus: "PENDING",
            sourceKind: "AI",
          },
        });
        externalCount += 1;

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

      await this.database.contextAnalysisRun.update({
        where: { id: runId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          summary: {
            issuesCreated: internalCount + externalCount,
            internalCount,
            externalCount,
            evidenceCreated,
            internalRunId: internalRun?.id ?? null,
            externalRunId: externalRun.id,
            analysisMethods: methods,
            model,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        { event: "context_analysis_failed", runId, err: error },
        "context synthesis failed",
      );
      await this.fail(
        runId,
        "La synthèse des enjeux a échoué avant d'aboutir. Aucun résultat n'a été enregistré, vous pouvez relancer.",
      );
    }
  }
}
