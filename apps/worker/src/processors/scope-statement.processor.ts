import { Processor, WorkerHost } from "@nestjs/bullmq";
import { buildScopePrompt, languageModel, languageProviderOptions, llmSettings } from "@qhse/ai";
import {
  scopeMaterialSchema,
  scopeStatementContentSchema,
  type ScopeMaterial,
  type ScopeStatementContent,
} from "@qhse/contracts";
import { createPrismaClient, Prisma } from "@qhse/database";
import { smqScope } from "@qhse/domain";
import { Output, generateText } from "ai";
import type { Job } from "bullmq";
import { queueNames } from "../queues.js";
import { acquireModelTokens } from "./regulatory-rate-limiter.js";
import { conservativeInputTokens } from "./regulatory-model-cost.js";
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export function validateScopeGeneration(output: ScopeStatementContent, material: ScopeMaterial) {
  if (!smqScope.validStatement(output, material)) throw new Error("SCOPE_STATEMENT_INVALID");
  if (material.declaration.sites.some((site) => !output.statement.includes(site.address)))
    throw new Error("SCOPE_SITE_MISSING");
}
@Processor(queueNames.scopeStatement, { concurrency: 2 })
export class ScopeStatementProcessor extends WorkerHost {
  private readonly db = createPrismaClient();
  private async generate(material: ScopeMaterial) {
    const settings = llmSettings();
    const provider = settings.profileProvider;
    const model = settings.profileModel;
    const prompt = buildScopePrompt(material, material.facts.language);
    await acquireModelTokens(
      `${provider}:${model}`,
      conservativeInputTokens(prompt) + 4000,
      200000,
    );
    const result = await generateText({
      model: languageModel({ provider, model }),
      system: prompt.system,
      prompt: prompt.context,
      output: Output.object({ schema: scopeStatementContentSchema }),
      timeout: settings.regulatoryTimeoutMs,
      maxOutputTokens: 4000,
      maxRetries: 0,
      providerOptions: languageProviderOptions(provider, { model }),
      telemetry: { isEnabled: false },
    });
    return { output: scopeStatementContentSchema.parse(result.output), model };
  }
  async process(job: Job<{ organizationId: string; payload: { runId: string } }>) {
    const run = await this.db.scopeRun.findFirst({
      where: {
        id: job.data.payload.runId,
        project: { organizationId: job.data.organizationId, archivedAt: null },
      },
    });
    if (!run || ["FAILED", "COMPLETED"].includes(run.status)) return;
    await this.db.scopeRun.update({ where: { id: run.id }, data: { status: "RUNNING" } });
    try {
      const material = scopeMaterialSchema.parse(run.inputSnapshot);
      const { output, model } = await this.generate(material);
      validateScopeGeneration(output, material);
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM projects WHERE id = ${run.projectId} FOR UPDATE`;
        const state = await tx.scopeState.findUniqueOrThrow({
          where: { projectId: run.projectId },
        });
        const current = await tx.scopeRun.findUniqueOrThrow({ where: { id: run.id } });
        if (current.status === "COMPLETED") return;
        if (state.revision !== run.revision) throw new Error("SCOPE_INPUT_CHANGED");
        await tx.scopeStatement.create({
          data: {
            projectId: run.projectId,
            statement: output.statement,
            nonApplicable: json(output.nonApplicable),
            aiProposal: json(output),
            fingerprint: material.fingerprint,
            verificationId: material.verification.id,
            sourceSnapshot: json({
              facts: material.facts,
              declaration: material.declaration,
              verification: material.verification,
            }),
            model,
            generatedAt: new Date(),
          },
        });
        await tx.scopeState.update({
          where: { projectId: run.projectId },
          data: { revision: { increment: 1 } },
        });
        await tx.scopeRun.update({
          where: { id: run.id },
          data: {
            status: "COMPLETED",
            outputSnapshot: json(output),
            model,
            completedAt: new Date(),
          },
        });
      });
    } catch (error) {
      const message =
        error instanceof Error && /^SCOPE_/.test(error.message)
          ? error.message
          : "SCOPE_GENERATION_FAILED";
      await this.db.scopeRun.update({
        where: { id: run.id },
        data: { status: "FAILED", error: message, completedAt: new Date() },
      });
    }
  }
}
