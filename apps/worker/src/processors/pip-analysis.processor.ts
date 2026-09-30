import { Processor, WorkerHost } from "@nestjs/bullmq";
import { buildPipPrompt, languageModel, languageProviderOptions, llmSettings } from "@qhse/ai";
import {
  pipMaterialSchema,
  pipInventoryOutputSchema,
  pipRequirementsOutputSchema,
  pipEvaluationOutputSchema,
  pipEvaluationContentSchema,
  type PipMaterial,
} from "@qhse/contracts";
import { createPrismaClient, Prisma, type DatabaseClient } from "@qhse/database";
import { smqPip } from "@qhse/domain";
import { createLogger } from "@qhse/observability";
import { Output, generateText } from "ai";
import type { Job } from "bullmq";
import type { z } from "zod";
import { queueNames } from "../queues.js";
import { acquireModelTokens } from "./regulatory-rate-limiter.js";
import { conservativeInputTokens } from "./regulatory-model-cost.js";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Refuse AI evidence which cannot be found in the supplied source material. */
export function supportedPipParty<
  T extends z.infer<typeof pipInventoryOutputSchema>["parties"][number],
>(party: T, material: PipMaterial): boolean {
  const corpus = [
    material.digest,
    ...material.issues.map((i) => `${i.title}\n${i.description ?? ""}`),
    ...material.regulations.map((r) => `${r.title}\n${r.requirementText ?? ""}`),
    ...material.clarifications.map((c) => `${c.question}\n${c.answer}`),
  ].join("\n");
  return party.evidence.every(
    (e) => e.sourceType === "ai_sector_knowledge" || corpus.includes(e.excerpt.trim()),
  );
}

/** No legal assertion without exact text in the published register. */
export function groundedPipRequirement(
  item: z.infer<typeof pipRequirementsOutputSchema>["parties"][number]["items"][number],
  material: PipMaterial,
) {
  const { services, ...content } = item;
  const source = material.regulations.find((r) => r.id === content.regulatoryEntryId);
  const verified = source?.requirementText && source.requirementText.trim() === content.text.trim();
  return {
    services: [...new Set(services)],
    content: {
      ...content,
      sourceType:
        content.sourceType === "normative" ||
        (content.sourceType === "legal_regulatory" && !verified)
          ? ("ai_recommendation" as const)
          : content.sourceType,
      regulatoryEntryId: source?.id ?? null,
      sourceLabel: source?.title ?? null,
      sourceUrl:
        source?.sourceUrl && /^https?:\/\//i.test(source.sourceUrl) ? source.sourceUrl : null,
    },
  };
}

@Processor(queueNames.pipAnalysis, { concurrency: 2 })
export class PipAnalysisProcessor extends WorkerHost {
  private readonly database: DatabaseClient = createPrismaClient();
  private readonly logger = createLogger({ base: { service: "qhse-worker" } });

  private async generate<T>(
    stage: "INVENTORY" | "REQUIREMENTS" | "EVALUATION",
    material: PipMaterial,
    schema: z.ZodType<T>,
  ) {
    const settings = llmSettings();
    const provider = settings.profileProvider;
    const model = settings.profileModel;
    const prompt = buildPipPrompt(stage, material, material.language);
    await acquireModelTokens(
      `${provider}:${model}`,
      conservativeInputTokens(prompt) + 12_000,
      200_000,
    );
    const result = await generateText({
      model: languageModel({ provider, model }),
      system: prompt.system,
      prompt: prompt.context,
      output: Output.object({ schema }),
      timeout: settings.regulatoryTimeoutMs,
      maxOutputTokens: 12_000,
      maxRetries: 2,
      ...(provider === "google" ? { temperature: 0.15 } : {}),
      providerOptions: languageProviderOptions(provider, { model }),
      telemetry: { isEnabled: false },
    });
    return { output: schema.parse(result.output), model };
  }
  async process(job: Job<{ organizationId: string; payload: { runId: string } }>): Promise<void> {
    const runId = job.data.payload.runId;
    const run = await this.database.pipRun.findFirst({
      where: { id: runId, project: { organizationId: job.data.organizationId, archivedAt: null } },
    });
    if (!run || run.status === "COMPLETED" || run.status === "FAILED") return;
    await this.database.pipRun.update({
      where: { id: run.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    try {
      const material = pipMaterialSchema.parse(run.inputSnapshot);
      const generated =
        run.stage === "INVENTORY"
          ? await this.generate(run.stage, material, pipInventoryOutputSchema)
          : run.stage === "REQUIREMENTS"
            ? await this.generate(run.stage, material, pipRequirementsOutputSchema)
            : await this.generate(run.stage, material, pipEvaluationOutputSchema);
      await this.database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM projects WHERE id = ${run.projectId} FOR UPDATE`;
        const current = await tx.pipRun.findUniqueOrThrow({ where: { id: run.id } });
        if (current.status === "COMPLETED") return;
        const state = await tx.pipState.findUniqueOrThrow({ where: { projectId: run.projectId } });
        if (state.revision !== run.revision) throw new Error("PIP_INPUT_CHANGED");
        if (run.stage === "INVENTORY") {
          const output = pipInventoryOutputSchema.parse(generated.output);
          const supported = output.parties.filter((party) => supportedPipParty(party, material));
          if (supported.length === 0) throw new Error("PIP_NO_SUPPORTED_PARTIES");
          for (const party of supported) {
            const canonicalKey = smqPip.canonicalPipKey(party.name);
            if (!canonicalKey) continue;
            // Stable identity preserves every prior human decision and manual addition.
            await tx.pipParty.upsert({
              where: { projectId_canonicalKey: { projectId: run.projectId, canonicalKey } },
              create: {
                projectId: run.projectId,
                runId: run.id,
                canonicalKey,
                aiProposal: json(party),
                effective: json(party),
              },
              update: {},
            });
          }
          for (const clarification of output.clarifications)
            await tx.pipClarification.upsert({
              where: {
                projectId_question: { projectId: run.projectId, question: clarification.question },
              },
              create: { projectId: run.projectId, runId: run.id, ...clarification },
              update: {},
            });
          await tx.pipState.update({
            where: { projectId: run.projectId },
            data: { inventoryFingerprint: run.contextFingerprint },
          });
          // Preserve content and past audit decisions, but reopen AI rows after upstream changes.
          if (state.inventoryFingerprint && state.inventoryFingerprint !== run.contextFingerprint) {
            await tx.pipParty.updateMany({
              where: {
                projectId: run.projectId,
                origin: "ai",
                reviewStatus: { in: ["VALIDATED", "MODIFIED"] },
              },
              data: { reviewStatus: "PENDING" },
            });
            await tx.pipRequirement.updateMany({
              where: {
                party: { projectId: run.projectId },
                reviewStatus: { in: ["VALIDATED", "MODIFIED"] },
              },
              data: {
                reviewStatus: "PENDING",
                allocationReviewed: false,
                noServiceConfirmed: false,
              },
            });
          }
          // An upstream change makes prior evaluations require a new professional decision.
          if (state.inventoryFingerprint !== run.contextFingerprint)
            await tx.pipEvaluation.updateMany({
              where: { party: { projectId: run.projectId } },
              data: { reviewStatus: "PENDING" },
            });
        } else if (run.stage === "REQUIREMENTS") {
          const output = pipRequirementsOutputSchema.parse(generated.output);
          this.assertCoverage(
            output.parties.map((p) => p.partyId),
            material,
          );
          for (const block of output.parties)
            for (const item of block.items) {
              const { content, services } = groundedPipRequirement(item, material);
              const canonicalKey = `${content.kind}:${smqPip.canonicalPipKey(content.text)}`;
              await tx.pipRequirement.upsert({
                where: { partyId_canonicalKey: { partyId: block.partyId, canonicalKey } },
                create: {
                  partyId: block.partyId,
                  runId: run.id,
                  canonicalKey,
                  aiProposal: json(content),
                  effective: json(content),
                  services: content.kind === "need" ? [] : services,
                },
                update: {},
              });
            }
          await tx.pipEvaluation.updateMany({
            where: { party: { projectId: run.projectId } },
            data: { reviewStatus: "PENDING" },
          });
        } else {
          const output = pipEvaluationOutputSchema.parse(generated.output);
          this.assertCoverage(
            output.evaluations.map((e) => e.partyId),
            material,
          );
          for (const evaluation of output.evaluations) {
            const prior = await tx.pipEvaluation.findFirst({
              where: { partyId: evaluation.partyId },
              orderBy: { createdAt: "desc" },
            });
            const effective = prior?.humanOverride
              ? pipEvaluationContentSchema.parse(prior.effective)
              : evaluation.content;
            if (
              !smqPip.evaluationComplete(
                {
                  reviewStatus: "VALIDATED",
                  requirements: [],
                  evaluation: { reviewStatus: "VALIDATED", content: evaluation.content },
                },
                material.method,
              )
            )
              throw new Error("PIP_EVALUATION_INCOMPLETE");
            await tx.pipEvaluation.create({
              data: {
                partyId: evaluation.partyId,
                runId: run.id,
                aiProposal: json(evaluation.content),
                effective: json(effective),
                humanOverride: prior?.humanOverride ?? false,
              },
            });
          }
        }
        await tx.pipState.update({
          where: { projectId: run.projectId },
          data: { revision: { increment: 1 }, validatedAt: null, validatedById: null },
        });
        await tx.pipRun.update({
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
      this.logger.error({ runId, error }, "PIP analysis failed");
      await this.database.pipRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage:
            error instanceof Error && error.message.startsWith("PIP_")
              ? error.message
              : "PIP_ANALYSIS_FAILED",
        },
      });
    }
  }
  private assertCoverage(ids: string[], material: PipMaterial) {
    const expected = new Set(material.parties.map((p) => p.id));
    if (
      ids.length !== expected.size ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !expected.has(id))
    )
      throw new Error("PIP_PARTY_COVERAGE_INVALID");
  }
}
