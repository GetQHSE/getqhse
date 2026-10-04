import { Processor, WorkerHost } from "@nestjs/bullmq";
import { buildPlanningPrompt, languageModel, languageProviderOptions, llmSettings } from "@qhse/ai";
import {
  planningMaterialSchema,
  planningProposalSchema,
  type PlanningMaterial,
} from "@qhse/contracts";
import { createPrismaClient, Prisma } from "@qhse/database";
import { Output, generateText } from "ai";
import type { Job } from "bullmq";
import { queueNames } from "../queues.js";
import { acquireModelTokens } from "./regulatory-rate-limiter.js";
import { conservativeInputTokens } from "./regulatory-model-cost.js";
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export function validatePlanningProposal(material: PlanningMaterial, value: unknown) {
  const out = planningProposalSchema.parse(value),
    stage = material.stage;
  const axes = new Set(
    material.document.axes.filter((x) => x.decision === "retained").map((x) => x.id),
  );
  const ps = new Set(
    material.document.processes.filter((x) => x.decision === "retained").map((x) => x.id),
  );
  if (
    (stage === "axes" && out.axes.length < 3) ||
    (stage === "statement" &&
      (out.statement.length < 600 ||
        out.statement.trim().split(/\s+/u).length < 140 ||
        out.statement.trim().split(/\s+/u).length > 700)) ||
    (stage === "objectives" &&
      (out.objectives.length < 3 || out.objectives.some((x) => !axes.has(x.axisId)))) ||
    (stage === "processes" &&
      (!out.processes.length ||
        out.processes.some((x) => ![x.purpose, x.inputs, x.outputs].every((v) => v.trim())))) ||
    (stage === "interactions" &&
      (!out.interactions.length ||
        out.interactions.some((x) => x.from === x.to || !ps.has(x.from) || !ps.has(x.to)) ||
        [...ps].some((id) => !out.interactions.some((x) => x.from === id || x.to === id))))
  )
    throw new Error("PLANNING_PROPOSAL_INVALID");
  return out;
}
@Processor(queueNames.planning, { concurrency: 2 })
export class PlanningProcessor extends WorkerHost {
  private readonly db = createPrismaClient();
  private async generate(material: PlanningMaterial) {
    const settings = llmSettings(),
      provider = settings.profileProvider,
      model = settings.profileModel,
      prompt = buildPlanningPrompt(material, material.sources.facts.language);
    await acquireModelTokens(
      `${provider}:${model}`,
      conservativeInputTokens(prompt) + 6000,
      200000,
    );
    const result = await generateText({
      model: languageModel({ provider, model }),
      system: prompt.system,
      prompt: prompt.context,
      output: Output.object({ schema: planningProposalSchema }),
      timeout: settings.regulatoryTimeoutMs,
      maxOutputTokens: 6000,
      maxRetries: 0,
      providerOptions: languageProviderOptions(provider, { model }),
      telemetry: { isEnabled: false },
    });
    return { output: validatePlanningProposal(material, result.output), model };
  }
  async process(job: Job<{ organizationId: string; payload: { runId: string } }>) {
    const run = await this.db.planningRun.findFirst({
      where: {
        id: job.data.payload.runId,
        project: { organizationId: job.data.organizationId, archivedAt: null },
      },
    });
    if (!run || ["COMPLETED", "FAILED"].includes(run.status)) return;
    await this.db.planningRun.update({ where: { id: run.id }, data: { status: "RUNNING" } });
    try {
      const material = planningMaterialSchema.parse(run.inputSnapshot),
        { output, model } = await this.generate(material);
      // The immutable proposal is applied separately by a professional. The API rechecks current sources and revision then.
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM planning_runs WHERE id = ${run.id} FOR UPDATE`;
        const current = await tx.planningRun.findUniqueOrThrow({ where: { id: run.id } });
        if (["COMPLETED", "FAILED"].includes(current.status)) return;
        await tx.planningRun.update({
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
      await this.db.planningRun.updateMany({
        where: { id: run.id, status: { not: "COMPLETED" } },
        data: { status: "FAILED", error: "PLANNING_GENERATION_FAILED", completedAt: new Date() },
      });
    }
  }
}
