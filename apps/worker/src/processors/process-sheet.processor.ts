import { Processor, WorkerHost } from "@nestjs/bullmq";
import {
  buildProcessSheetPrompt,
  languageModel,
  languageProviderOptions,
  llmSettings,
} from "@qhse/ai";
import {
  processSheetGenerationSchema,
  processSheetProposalSchema,
  type ProcessSheetGeneration,
} from "@qhse/contracts";
import { createPrismaClient, Prisma } from "@qhse/database";
import { Output, generateText } from "ai";
import type { Job } from "bullmq";
import { queueNames } from "../queues.js";
import { acquireModelTokens } from "./regulatory-rate-limiter.js";
import { conservativeInputTokens } from "./regulatory-model-cost.js";
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
@Processor(queueNames.processSheets, { concurrency: 2 })
export class ProcessSheetProcessor extends WorkerHost {
  private readonly db = createPrismaClient();
  private async generate(material: ProcessSheetGeneration) {
    const settings = llmSettings(),
      provider = settings.profileProvider,
      model = settings.profileModel,
      prompt = buildProcessSheetPrompt(material, material.material.sources.facts.language);
    await acquireModelTokens(
      `${provider}:${model}`,
      conservativeInputTokens(prompt) + 6000,
      200000,
    );
    const result = await generateText({
      model: languageModel({ provider, model }),
      system: prompt.system,
      prompt: prompt.context,
      output: Output.object({ schema: processSheetProposalSchema }),
      timeout: settings.regulatoryTimeoutMs,
      maxOutputTokens: 6000,
      maxRetries: 0,
      providerOptions: languageProviderOptions(provider, { model }),
      telemetry: { isEnabled: false },
    });
    return { output: processSheetProposalSchema.parse(result.output), model };
  }
  async process(job: Job<{ organizationId: string; payload: { runId: string } }>) {
    const run = await this.db.processSheetRun.findFirst({
      where: {
        id: job.data.payload.runId,
        project: { organizationId: job.data.organizationId, archivedAt: null },
      },
    });
    if (!run || ["COMPLETED", "FAILED"].includes(run.status)) return;
    const claimed = await this.db.processSheetRun.updateMany({
      where: { id: run.id, status: { in: ["DRAFT", "RUNNING"] } },
      data: { status: "RUNNING" },
    });
    if (!claimed.count) return;
    try {
      const material = processSheetGenerationSchema.parse(run.inputSnapshot),
        { output, model } = await this.generate(material);
      // The immutable proposal is applied separately by a professional. The API rechecks current sources and revision then.
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM process_sheet_runs WHERE id = ${run.id} FOR UPDATE`;
        const current = await tx.processSheetRun.findUniqueOrThrow({ where: { id: run.id } });
        if (["COMPLETED", "FAILED"].includes(current.status)) return;
        await tx.processSheetRun.update({
          where: { id: run.id },
          data: {
            status: "COMPLETED",
            outputSnapshot: json(output),
            model,
            completedAt: new Date(),
          },
        });
      });
    } catch {
      await this.db.processSheetRun.updateMany({
        where: { id: run.id, status: { not: "COMPLETED" } },
        data: { status: "FAILED", error: "SHEET_GENERATION_FAILED", completedAt: new Date() },
      });
    }
  }
}
