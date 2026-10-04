import { createHash } from "node:crypto";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { buildRoPrompt, languageModel, languageProviderOptions, llmSettings } from "@qhse/ai";
import {
  roMaterialSchema,
  roGenerationOutputSchema,
  roTreatmentOutputSchema,
  roEffectiveSchema,
  type RoMaterial,
} from "@qhse/contracts";
import { createPrismaClient, Prisma } from "@qhse/database";
import { smqRo, smqPip } from "@qhse/domain";
import { createLogger } from "@qhse/observability";
import { Output, generateText } from "ai";
import type { Job } from "bullmq";
import type { z } from "zod";
import { queueNames } from "../queues.js";
import { acquireModelTokens } from "./regulatory-rate-limiter.js";
import { conservativeInputTokens } from "./regulatory-model-cost.js";
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export function validateRoGeneration(
  output: z.infer<typeof roGenerationOutputSchema>,
  material: RoMaterial,
) {
  const sources = new Map(material.sources.map((s) => [s.id, s]));
  const counts = new Map<string, number>();
  for (const item of output.items) {
    const s = sources.get(item.sourceId);
    if (!s) throw new Error("RO_SOURCE_INVALID");
    if (!smqRo.validRoRating(item.content.type, item.rating)) throw new Error("RO_RATING_INVALID");
    const key = `${s.id}:${item.content.type}`;
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    if (s.branch === "pip_requirement" && count > 1) throw new Error("RO_PIP_LIMIT_EXCEEDED");
    if (
      item.content.type === "opportunity" &&
      /^(mettre en place|créer|déployer|implement|create|deploy|إنشاء|تنفيذ)\b/i.test(
        item.content.title.trim(),
      )
    )
      throw new Error("RO_ACTION_SHAPED_OPPORTUNITY");
  }
}
export const roTreatmentFingerprint = (item: RoMaterial["items"][number], digest: string) =>
  createHash("sha256")
    .update(JSON.stringify({ digest, source: item.source, effective: item.effective }))
    .digest("hex");

@Processor(queueNames.roAnalysis, { concurrency: 2 })
export class RoAnalysisProcessor extends WorkerHost {
  private readonly database = createPrismaClient();
  private readonly logger = createLogger({ base: { service: "qhse-worker" } });
  private async generate<T>(stage: string, material: RoMaterial, schema: z.ZodType<T>) {
    const settings = llmSettings();
    const provider = settings.profileProvider;
    const model = settings.profileModel;
    const prompt = buildRoPrompt(stage, material, material.language);
    await acquireModelTokens(
      `${provider}:${model}`,
      conservativeInputTokens(prompt) + 16000,
      200000,
    );
    const result = await generateText({
      model: languageModel({ provider, model }),
      system: prompt.system,
      prompt: prompt.context,
      output: Output.object({ schema }),
      timeout: settings.regulatoryTimeoutMs,
      maxOutputTokens: 16000,
      maxRetries: 2,
      providerOptions: languageProviderOptions(provider, { model }),
      telemetry: { isEnabled: false },
    });
    return { output: schema.parse(result.output), model };
  }
  async process(job: Job<{ organizationId: string; payload: { runId: string } }>) {
    const run = await this.database.roRun.findFirst({
      where: {
        id: job.data.payload.runId,
        project: { organizationId: job.data.organizationId, archivedAt: null },
      },
    });
    if (!run || ["COMPLETED", "FAILED"].includes(run.status)) return;
    await this.database.roRun.update({
      where: { id: run.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    try {
      const material = roMaterialSchema.parse(run.inputSnapshot);
      if (run.stage === "TREATMENT") {
        const rows = await this.database.roItem.findMany({
          where: { projectId: run.projectId, id: { in: material.items.map((i) => i.id) } },
          include: { actions: true },
        });
        material.items = material.items.filter((i) => {
          const row = rows.find((r) => r.id === i.id);
          return (
            !row?.actions.some((a) => a.reviewStatus !== "NOT_RETAINED") ||
            row.treatmentFingerprint !== roTreatmentFingerprint(i, material.digest)
          );
        });
      }
      const generated =
        (run.stage === "GENERATION" && material.sources.length === 0) ||
        (run.stage === "TREATMENT" && material.items.length === 0)
          ? { output: { items: [] }, model: "none" }
          : run.stage === "GENERATION"
            ? await this.generate(run.stage, material, roGenerationOutputSchema)
            : await this.generate(run.stage, material, roTreatmentOutputSchema);
      await this.database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM projects WHERE id = ${run.projectId} FOR UPDATE`;
        const current = await tx.roRun.findUniqueOrThrow({ where: { id: run.id } });
        if (current.status === "COMPLETED") return;
        const state = await tx.roState.findUniqueOrThrow({ where: { projectId: run.projectId } });
        if (state.revision !== run.revision) throw new Error("RO_INPUT_CHANGED");
        if (run.stage === "GENERATION") {
          const output = roGenerationOutputSchema.parse(generated.output);
          validateRoGeneration(output, material);
          const sources = new Map(material.sources.map((s) => [s.id, s]));
          // Existing effective values survive regeneration; changed sources reopen dependent decisions.
          for (const source of material.sources) {
            const rows = await tx.roItem.findMany({
              where: { projectId: run.projectId, sourceId: source.id },
            });
            for (const row of rows) {
              const prior = row.sourceSnapshot as { fingerprint?: string } | null;
              if (
                prior?.fingerprint !== source.fingerprint ||
                ((state.branchFingerprints as Record<string, string>)[source.branch] &&
                  (state.branchFingerprints as Record<string, string>)[source.branch] !==
                    run.contextFingerprint)
              ) {
                const effective = roEffectiveSchema.parse(row.effective);
                effective.ratingReviewed = false;
                effective.controlsReviewed = false;
                await tx.roItem.update({
                  where: { id: row.id },
                  data: {
                    sourceSnapshot: json(source),
                    effective: json(effective),
                    ...(row.reviewStatus !== "NOT_RETAINED" ? { reviewStatus: "PENDING" } : {}),
                  },
                });
                await tx.roAction.updateMany({
                  where: { itemId: row.id },
                  data: { reviewStatus: "PENDING" },
                });
              }
            }
          }
          for (const item of output.items) {
            const source = sources.get(item.sourceId)!;
            const canonicalKey = `${source.id}:${item.content.type}:${smqPip.canonicalPipKey(item.content.title)}`;
            const score =
              item.content.type === "risk"
                ? item.rating.probability! * item.rating.impact!
                : item.rating.feasibility! * item.rating.benefit!;
            const effective = {
              content: item.content,
              rating: { ...item.rating, priority: smqRo.defaultRiskPriority(score) },
              ratingReviewed: false,
              controlsState: "undeclared",
              controls: [],
              controlsReviewed: false,
            };
            await tx.roItem.upsert({
              where: { projectId_canonicalKey: { projectId: run.projectId, canonicalKey } },
              create: {
                projectId: run.projectId,
                canonicalKey,
                sourceId: source.id,
                sourceSnapshot: json(source),
                aiProposal: json(effective),
                effective: json(effective),
              },
              update: {},
            });
          }
          const fingerprints = state.branchFingerprints as Record<string, string>;
          if (!run.branch) throw new Error("RO_BRANCH_REQUIRED");
          await tx.roState.update({
            where: { projectId: run.projectId },
            data: {
              branchFingerprints: json({ ...fingerprints, [run.branch]: run.contextFingerprint }),
            },
          });
        } else {
          const output = roTreatmentOutputSchema.parse(generated.output);
          const expected = new Set(
            material.items.filter(smqRo.roTreatmentEligible).map((i) => i.id),
          );
          if (
            output.items.length !== expected.size ||
            new Set(output.items.map((i) => i.itemId)).size !== expected.size ||
            output.items.some((i) => !expected.has(i.itemId))
          )
            throw new Error("RO_TREATMENT_COVERAGE_INVALID");
          for (const item of output.items)
            for (const action of item.actions) {
              if (action.plannedDate < material.referenceDate)
                throw new Error("RO_ACTION_DATE_INVALID");
              await tx.roAction.upsert({
                where: {
                  itemId_canonicalKey: {
                    itemId: item.itemId,
                    canonicalKey: smqPip.canonicalPipKey(action.title),
                  },
                },
                create: {
                  itemId: item.itemId,
                  canonicalKey: smqPip.canonicalPipKey(action.title),
                  aiProposal: json(action),
                  effective: json(action),
                },
                update: {},
              });
            }
        }
        if (run.stage === "TREATMENT")
          for (const item of material.items)
            await tx.roItem.update({
              where: { id: item.id },
              data: { treatmentFingerprint: roTreatmentFingerprint(item, material.digest) },
            });
        await tx.roState.update({
          where: { projectId: run.projectId },
          data: { revision: { increment: 1 }, validatedAt: null, validatedById: null },
        });
        await tx.roRun.update({
          where: { id: run.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            model: generated.model,
            outputSnapshot: json(generated.output),
          },
        });
      });
    } catch (error) {
      this.logger.error({ runId: run.id, error }, "R&O analysis failed");
      await this.database.roRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage:
            error instanceof Error && error.message.startsWith("RO_")
              ? error.message
              : "RO_ANALYSIS_FAILED",
        },
      });
    }
  }
}
