import { Processor, WorkerHost } from "@nestjs/bullmq";
import {
  contextExternalDiscoveryPrompt,
  contextExternalPlanPrompt,
  contextExternalStructurePrompt,
  languageModel,
  languageProviderOptions,
  llmSettings,
  providerWebSearch,
} from "@qhse/ai";
import type { LanguageProvider } from "@qhse/config";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";
import { smqContext } from "@qhse/domain";
import { createLogger } from "@qhse/observability";
import { Output, generateText } from "ai";
import type { Job } from "bullmq";
import { z } from "zod";

import { queueNames } from "../queues.js";
import { acquireModelTokens } from "./regulatory-rate-limiter.js";
import { conservativeInputTokens, positiveNumber } from "./regulatory-model-cost.js";

const { canonicalKey, factorFingerprint, PESTEL_DIMENSIONS } = smqContext;

/**
 * Step 2 of "Analyse des enjeux" (ISO 9001 §4.1) — external context research.
 *
 * CANONICAL DIGEST → RESEARCH PLAN → ONE GROUNDED WEB-SEARCH CALL →
 * STRUCTURING (restricted to discovered sources) → CROSS-RUN IDENTITY →
 * PERSISTENCE. No web search happens for the légal dimension: it is reused
 * from the veille (RegulatoryRegisterEntry), never re-researched.
 *
 * A factor with no real citation is dropped rather than shown unsourced. A
 * failed run is persisted FAILED with its reason — never COMPLETED with
 * invented results.
 */

const planSchema = z.object({
  entries: z
    .array(z.object({ dimension: z.string(), query: z.string(), rationale: z.string() }))
    .max(8),
  excludedDimensions: z.array(z.string()),
});

const factorSchema = z.object({
  categoryKey: z.string(),
  categoryLabel: z.string(),
  title: z.string(),
  description: z.string(),
  relevanceToCompany: z.string(),
  influenceOnObjectives: z.string().nullable(),
  influenceOnQuality: z.string().nullable(),
  influenceOnCustomerSatisfaction: z.string().nullable(),
  geographicScope: z.string().nullable(),
  orientation: z.enum(["favorable", "defavorable", "incertain"]),
  evidenceStrength: z.enum(["solide", "moderee", "faible"]),
  confidence: z.number(),
  sourceUrls: z.array(z.string()),
});
const structureSchema = z.object({ factors: z.array(factorSchema) });

function contextTokensPerMinute(): number {
  return positiveNumber("CONTEXT_TOKENS_PER_MINUTE", 200_000);
}

/** Same pair used for regulatory discovery: the only settings axis already
 * paired with providerWebSearch()'s budget and location defaults. */
function contextResearchProvider(): LanguageProvider {
  return llmSettings().regulatoryProvider;
}
function contextResearchModel(): string {
  return llmSettings().regulatoryModel;
}

function clamp01(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
}

/**
 * The légal dimension is excluded by deterministic code, not by trusting the
 * model's own excludedDimensions list: it matches smqContext.PESTEL_DIMENSIONS,
 * where "légal" is the one dimension flagged reusesRegulatory. A model that
 * forgets to exclude it, or names it slightly differently in
 * excludedDimensions, never gets a second chance to leak a legal search past
 * this filter.
 */
export function excludeLegalDimension<T extends { dimension: string }>(entries: T[]): T[] {
  const legalDimension = PESTEL_DIMENSIONS.find((dimension) => dimension.reusesRegulatory);
  if (!legalDimension) return entries;
  return entries.filter((entry) => entry.dimension !== legalDimension.label);
}

/** A factor with no citation among the sources actually returned by the
 * search call is dropped rather than shown unsourced — never fabricated. */
export function sanitizeExternalFactors<
  T extends { title: string; relevanceToCompany: string; sourceUrls: string[] },
>(factors: T[], citedUrls: ReadonlySet<string>): T[] {
  return factors
    .filter((factor) => factor.title.trim() && factor.relevanceToCompany.trim())
    .map((factor) => ({
      ...factor,
      sourceUrls: factor.sourceUrls.filter((url) => citedUrls.has(url)),
    }))
    .filter((factor) => factor.sourceUrls.length > 0);
}

@Processor(queueNames.contextExternalResearch, { concurrency: 2 })
export class ContextExternalResearchProcessor extends WorkerHost {
  private readonly database: DatabaseClient = createPrismaClient();
  private readonly logger = createLogger({ base: { service: "qhse-worker" } });

  async process(job: Job<{ payload: { runId: string } }>): Promise<void> {
    const runId = job.data.payload.runId;
    const run = await this.database.contextExternalResearchRun.findUnique({
      where: { id: runId },
    });
    if (!run) return;

    const project = await this.database.project.findUniqueOrThrow({
      where: { id: run.projectId },
      include: {
        profile: { include: { snapshots: { orderBy: { sequence: "desc" }, take: 1 } } },
        contextSettings: true,
        regulatoryWatch: true,
      },
    });

    const fail = async (message: string): Promise<void> => {
      await this.database.contextExternalResearchRun.update({
        where: { id: runId },
        data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
      });
    };

    if (!project.contextSettings) {
      // A NEW run requires an explicit persisted method choice; the default is a
      // display fallback only, never silently executed.
      return fail("Choisissez d'abord la méthode d'analyse SWOT ou PESTEL.");
    }
    const method = project.contextSettings.analysisMethod;

    const internalInputs = await this.database.contextInternalInput.findMany({
      where: { projectId: project.id },
    });
    const completedInternalInputs = internalInputs.filter(
      (input) => input.answerText.trim() && input.status === "answered",
    );
    if (completedInternalInputs.length === 0) {
      return fail(
        "Le contexte interne (étape 1) n'est pas encore validé : complétez-le avant de lancer l'analyse externe.",
      );
    }

    const snapshot = project.profile?.snapshots[0] ?? null;
    if (!snapshot) {
      return fail(
        "Aucune réponse validée dans le profil du projet : l'analyse externe a besoin d'un profil d'entreprise validé.",
      );
    }

    const registerEntries = project.regulatoryWatch?.currentBaselineId
      ? await this.database.regulatoryRegisterEntry.findMany({
          where: { baselineId: project.regulatoryWatch.currentBaselineId },
          take: 60,
        })
      : [];

    const digest = buildDigest({
      project,
      snapshot: snapshot.data,
      internalInputs: completedInternalInputs,
      registerEntries,
    });

    await this.database.contextExternalResearchRun.update({
      where: { id: runId },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    const provider = contextResearchProvider();
    const model = contextResearchModel();

    try {
      // ---------------- 1. plan (no browsing, no factor invented)
      const planPrompt = contextExternalPlanPrompt.build({ digest, method });
      await acquireModelTokens(
        `${provider}:${model}`,
        conservativeInputTokens(planPrompt) + 1_000,
        contextTokensPerMinute(),
      );
      const planResult = await generateText({
        model: languageModel({ provider, model }),
        system: planPrompt.system,
        prompt: planPrompt.context,
        output: Output.object({ schema: planSchema }),
        timeout: llmSettings().regulatoryTimeoutMs,
        maxOutputTokens: 2_000,
        maxRetries: 2,
        providerOptions: languageProviderOptions(provider, { model }),
        telemetry: { isEnabled: false },
      });
      const plan = planSchema.parse(planResult.output);
      const entries = excludeLegalDimension(plan.entries);
      if (entries.length === 0) {
        return fail(
          "Le périmètre d'analyse externe n'a pas pu être défini à partir du contexte disponible (secteur ou pays insuffisamment précisés).",
        );
      }

      // ---------------- 2. one real grounded web-research call
      const discoveryPrompt = contextExternalDiscoveryPrompt.build({
        digest,
        planEntries: entries,
      });
      const search = providerWebSearch(provider);
      await acquireModelTokens(
        `${provider}:${model}`,
        conservativeInputTokens(discoveryPrompt) + 4_000,
        contextTokensPerMinute(),
      );
      const discoveryResult = await generateText({
        model: languageModel({ provider, model }),
        system: discoveryPrompt.system,
        prompt: discoveryPrompt.context,
        tools: { [search.name]: search.tool as never },
        toolChoice: { type: "tool" as const, toolName: search.name },
        timeout: llmSettings().regulatoryTimeoutMs,
        maxOutputTokens: 8_000,
        maxRetries: 2,
        providerOptions: languageProviderOptions(provider, { model }),
        telemetry: { isEnabled: false },
      });
      const citedUrls = new Map(
        discoveryResult.sources.flatMap((source) =>
          source.sourceType === "url" ? [[source.url, source.title ?? null] as const] : [],
        ),
      );
      if (citedUrls.size === 0) {
        return fail(
          "Aucune source consultable n'a été retournée par la recherche web. Aucun facteur n'a été enregistré.",
        );
      }

      // ---------------- 3. structuring, restricted to discovered sources
      const structurePrompt = contextExternalStructurePrompt.build({
        digest,
        researchText: discoveryResult.text,
        allowedUrls: [...citedUrls.keys()],
      });
      await acquireModelTokens(
        `${provider}:${model}`,
        conservativeInputTokens(structurePrompt) + 4_000,
        contextTokensPerMinute(),
      );
      const structureResult = await generateText({
        model: languageModel({ provider, model }),
        system: structurePrompt.system,
        prompt: structurePrompt.context,
        output: Output.object({ schema: structureSchema }),
        timeout: llmSettings().regulatoryTimeoutMs,
        maxOutputTokens: 8_000,
        maxRetries: 2,
        providerOptions: languageProviderOptions(provider, { model }),
        telemetry: { isEnabled: false },
      });
      const { factors: rawFactors } = structureSchema.parse(structureResult.output);

      const sanitized = sanitizeExternalFactors(rawFactors, new Set(citedUrls.keys()));

      if (sanitized.length === 0) {
        return fail(
          "Aucun facteur externe suffisamment documenté n'a pu être retenu. Le résultat est volontairement vide plutôt qu'approximatif.",
        );
      }

      // Cross-run identity: previous factors of the SAME project only.
      const previousRows = await this.database.contextExternalFactor.findMany({
        where: { projectId: project.id },
        select: { id: true, factorFingerprint: true },
        orderBy: { createdAt: "desc" },
        take: 1_000,
      });
      const previousByFingerprint = new Map<string, string>();
      for (const row of previousRows) {
        if (!previousByFingerprint.has(row.factorFingerprint)) {
          previousByFingerprint.set(row.factorFingerprint, row.id);
        }
      }

      let factorsCreated = 0;
      let sourcesCreated = 0;
      const categories = new Set<string>();
      const insertedFingerprints = new Set<string>();

      for (const factor of sanitized) {
        const categoryKeyValue =
          factor.categoryKey.trim().toLowerCase().replace(/\s+/g, "_") || "autre";
        const key = canonicalKey(factor.title, factor.categoryLabel);
        if (!key) continue;
        const fingerprint = await factorFingerprint(project.id, categoryKeyValue, key);
        if (insertedFingerprints.has(fingerprint)) continue;
        insertedFingerprints.add(fingerprint);
        const previousId = previousByFingerprint.get(fingerprint) ?? null;

        const created = await this.database.contextExternalFactor.create({
          data: {
            runId,
            projectId: project.id,
            categoryKey: categoryKeyValue,
            categoryLabel: factor.categoryLabel.trim() || categoryKeyValue,
            title: factor.title.trim(),
            description: factor.description.trim() || null,
            relevanceToCompany: factor.relevanceToCompany.trim(),
            influenceOnObjectives: factor.influenceOnObjectives?.trim() || null,
            influenceOnQuality: factor.influenceOnQuality?.trim() || null,
            influenceOnCustomerSatisfaction: factor.influenceOnCustomerSatisfaction?.trim() || null,
            geographicScope: factor.geographicScope?.trim() || null,
            orientation: factor.orientation,
            evidenceStrength: factor.evidenceStrength,
            confidence: clamp01(factor.confidence),
            sourceOrigin: "web_research",
            canonicalKey: key,
            factorFingerprint: fingerprint,
            comparisonStatus: previousId ? "recurrent" : "new",
            previousFactorId: previousId,
            model,
          },
        });
        factorsCreated += 1;
        categories.add(categoryKeyValue);

        for (const url of factor.sourceUrls.slice(0, 8)) {
          await this.database.contextExternalFactorSource.create({
            data: {
              factorId: created.id,
              url,
              title: citedUrls.get(url) ?? null,
              groundingOrigin: "search_grounding",
              authorityTier: "grounded",
            },
          });
          sourcesCreated += 1;
        }
      }

      if (factorsCreated === 0) {
        return fail(
          "Les facteurs externes identifiés n'ont pas pu être enregistrés. Aucun résultat approximatif n'a été conservé.",
        );
      }

      await this.database.contextExternalResearchRun.update({
        where: { id: runId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          model,
          regulatoryRunId: null,
          searchQueries: entries.map((entry) => entry.query),
          summary: {
            factorsCreated,
            sourcesCreated,
            categoriesCovered: [...categories],
            excludedDimensions: plan.excludedDimensions,
            reusedRegulatoryEntries: registerEntries.length,
            analysisMethod: method,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        { event: "context_external_research_failed", runId, err: error },
        "context external research failed",
      );
      await fail(
        "L'analyse externe a échoué avant d'aboutir. Aucun résultat n'a été enregistré, vous pouvez relancer.",
      );
    }
  }
}

export function buildDigest(input: {
  project: { name: string; entityType: string; description: string | null; standardCode: string };
  snapshot: unknown;
  internalInputs: { sectionKey: string; questionLabel: string; answerText: string }[];
  registerEntries: { citationLabel: string; sourceReference: string | null }[];
}): string {
  const lines: string[] = [
    "== IDENTITÉ DE L'ORGANISATION ==",
    `Projet : ${input.project.name}`,
    `Type d'entité : ${input.project.entityType}`,
    `Description : ${input.project.description ?? "non précisée"}`,
    `Référentiel : ${input.project.standardCode}`,
    "",
    "== PROFIL VALIDÉ (faits d'entreprise) ==",
    JSON.stringify(input.snapshot),
    "",
    "== CONTEXTE INTERNE DÉCLARÉ (étape 1) ==",
  ];
  if (input.internalInputs.length === 0) {
    lines.push("Aucune information interne renseignée.");
  } else {
    const bySection = new Map<string, typeof input.internalInputs>();
    for (const item of input.internalInputs) {
      const bucket = bySection.get(item.sectionKey) ?? [];
      bucket.push(item);
      bySection.set(item.sectionKey, bucket);
    }
    for (const [section, items] of bySection) {
      lines.push("", `## ${section}`);
      for (const item of items) {
        lines.push(`- ${item.questionLabel}`, `  ${item.answerText}`);
      }
    }
  }
  lines.push("", "== CONTEXTE RÉGLEMENTAIRE DÉJÀ ÉTABLI (module veille) ==");
  if (input.registerEntries.length === 0) {
    lines.push(
      "Aucune veille réglementaire publiée : la dimension légale ne doit PAS être recherchée ici.",
    );
  } else {
    for (const entry of input.registerEntries) {
      lines.push(
        `- ${entry.citationLabel}${entry.sourceReference ? ` (${entry.sourceReference})` : ""}`,
      );
    }
  }
  return lines.join("\n");
}
