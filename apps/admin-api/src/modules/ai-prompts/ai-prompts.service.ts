import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { CurrentUser } from "@qhse/auth";
import {
  getPromptDefinition,
  promptCatalog,
  promptHash,
  promptPreviewVariables,
  protectedPromptRules,
  renderPromptTemplate,
  validatePromptTemplate,
  refreshAiPrompts,
  isProviderConfigured,
  languageModel,
  languageProviderOptions,
  llmSettings,
  AI_PROMPT_SETTINGS_ROW_ID,
} from "@qhse/ai";
import {
  createPromptRevisionSchema,
  testPromptRevisionSchema,
  validatePromptRevisionSchema,
  publishPromptRevisionSchema,
  updatePromptSourceSchema,
  type PromptSourceView,
} from "@qhse/contracts";
import { Output, generateText } from "ai";
import type { z } from "zod";
import { AuthService } from "../auth/auth.service.js";

const editors = new Set(["super_admin", "platform_admin", "content_manager"]);
const publishers = new Set(["super_admin", "platform_admin"]);

@Injectable()
export class AiPromptsService {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  private get db() {
    return this.auth.database;
  }
  private requireRole(actor: CurrentUser, roles = editors) {
    if (!roles.has(actor.platformRole ?? ""))
      throw new ForbiddenException("This role cannot perform this prompt operation");
  }
  private definition(key: string) {
    try {
      return getPromptDefinition(key);
    } catch {
      throw new NotFoundException("Prompt not found");
    }
  }
  private checkTemplate(key: string, template: string) {
    try {
      validatePromptTemplate(key, template);
    } catch (error) {
      throw new UnprocessableEntityException(
        error instanceof Error ? error.message : "Invalid template",
      );
    }
  }
  private async revision(key: string, id: string) {
    const definition = this.definition(key);
    const revision = await this.db.aiPromptRevision.findFirst({ where: { id, promptKey: key } });
    if (!revision) throw new NotFoundException("Prompt revision not found");
    if (revision.baseVersion !== definition.version)
      throw new ConflictException(
        "The bundled prompt changed. Create a new draft against the current default.",
      );
    this.checkTemplate(key, revision.template);
    if (promptHash(revision.template) !== revision.templateHash)
      throw new ConflictException("Prompt content hash mismatch");
    return revision;
  }

  async source(): Promise<PromptSourceView> {
    const record = await this.db.aiPromptSetting.findUnique({
      where: { id: AI_PROMPT_SETTINGS_ROW_ID },
    });
    return { source: record?.source ?? "DATABASE", generation: record?.generation ?? 0 };
  }

  async updateSource(
    actor: CurrentUser,
    input: z.infer<typeof updatePromptSourceSchema>,
  ): Promise<PromptSourceView> {
    this.requireRole(actor, publishers);
    const result = await this.db.$transaction(async (tx) => {
      const current = await tx.aiPromptSetting.upsert({
        where: { id: AI_PROMPT_SETTINGS_ROW_ID },
        create: { id: AI_PROMPT_SETTINGS_ROW_ID },
        update: {},
      });
      if (current.generation !== input.expectedGeneration)
        throw new ConflictException(
          "Another administrator changed the prompt source. Reload before switching.",
        );
      const updated = await tx.aiPromptSetting.updateMany({
        where: { id: AI_PROMPT_SETTINGS_ROW_ID, generation: input.expectedGeneration },
        data: {
          source: input.source,
          generation: { increment: 1 },
          updatedByUserId: actor.id,
        },
      });
      if (!updated.count)
        throw new ConflictException(
          "Another administrator changed the prompt source. Reload before switching.",
        );
      return { source: input.source, generation: input.expectedGeneration + 1 };
    });
    await refreshAiPrompts().catch(() => undefined);
    return result;
  }

  async list() {
    const records = await this.db.aiPrompt.findMany({ include: { activeRevision: true } });
    return promptCatalog.map((entry) => {
      const record = records.find((item) => item.key === entry.key);
      return {
        ...entry,
        activeRevisionId: record?.activeRevisionId ?? null,
        generation: record?.generation ?? 0,
        activeCompatible:
          !record?.activeRevision || record.activeRevision.baseVersion === entry.version,
      };
    });
  }

  async detail(key: string) {
    this.definition(key);
    const [catalog, revisions, publications] = await Promise.all([
      this.list(),
      this.db.aiPromptRevision.findMany({
        where: { promptKey: key },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
        include: { tests: { orderBy: { createdAt: "desc" }, take: 10 } },
      }),
      this.db.aiPromptPublication.findMany({
        where: { promptKey: key },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    const definition = catalog.find((entry) => entry.key === key)!;
    if (
      definition.activeRevisionId &&
      !revisions.some((revision) => revision.id === definition.activeRevisionId)
    ) {
      const active = await this.db.aiPromptRevision.findFirst({
        where: { id: definition.activeRevisionId, promptKey: key },
        include: { tests: { orderBy: { createdAt: "desc" }, take: 10 } },
      });
      if (active) revisions.push(active);
    }
    return {
      definition,
      protectedRules: protectedPromptRules,
      revisions,
      publications,
    };
  }

  async create(actor: CurrentUser, key: string, input: z.infer<typeof createPromptRevisionSchema>) {
    this.requireRole(actor);
    const definition = this.definition(key);
    this.checkTemplate(key, input.template);
    const created = await this.db.$transaction(async (tx) => {
      await tx.aiPrompt.upsert({ where: { key }, create: { key }, update: {} });
      return tx.aiPromptRevision.create({
        data: {
          promptKey: key,
          baseVersion: definition.version,
          template: input.template,
          templateHash: promptHash(input.template),
          changeNote: input.changeNote,
          createdById: actor.id,
        },
      });
    });
    return { ...(await this.detail(key)), createdRevisionId: created.id };
  }

  async test(
    actor: CurrentUser,
    key: string,
    id: string,
    input: z.infer<typeof testPromptRevisionSchema>,
  ) {
    this.requireRole(actor);
    const revision = await this.revision(key, id);
    const definition = this.definition(key);
    const settings = llmSettings();
    const regulatory =
      key.startsWith("regulatory.") ||
      key.startsWith("documents.") ||
      key.startsWith("context.external-");
    const provider = regulatory ? settings.regulatoryProvider : settings.profileProvider;
    const model = regulatory ? settings.regulatoryModel : settings.profileModel;
    if (!isProviderConfigured(provider))
      throw new UnprocessableEntityException(
        "Configure the feature's model provider before running a preview",
      );
    const variables = promptPreviewVariables(key, input.language, input.countries);
    const result = await generateText({
      model: languageModel({ provider, model }),
      system: renderPromptTemplate(key, revision.template, variables),
      prompt: `ADMIN PREVIEW: synthetic example material only. No application tools or web search are available.\n${input.context}`,
      ...(definition.responseMode === "json" ? { output: Output.json() } : {}),
      maxOutputTokens: 4000,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(60_000),
      providerOptions: languageProviderOptions(provider, { model }),
      telemetry: { isEnabled: false },
    });
    const output =
      definition.responseMode === "json" ? JSON.stringify(result.output, null, 2) : result.text;
    if (!output?.trim()) throw new UnprocessableEntityException("The preview returned no output");
    await this.db.aiPromptTest.create({
      data: {
        revisionId: id,
        language: input.language,
        inputHash: promptHash(JSON.stringify(input)),
        output,
        provider,
        model,
        createdById: actor.id,
      },
    });
    return this.detail(key);
  }

  async validate(
    actor: CurrentUser,
    key: string,
    id: string,
    input: z.infer<typeof validatePromptRevisionSchema>,
  ) {
    this.requireRole(actor);
    await this.revision(key, id);
    if (!(await this.db.aiPromptTest.count({ where: { revisionId: id } })))
      throw new ConflictException(
        "Run and review at least one preview before validating this revision",
      );
    const result = await this.db.aiPromptRevision.updateMany({
      where: { id, promptKey: key, status: "DRAFT" },
      data: {
        status: "VALIDATED",
        validatedById: actor.id,
        validatedAt: new Date(),
        validationNote: input.note,
      },
    });
    if (!result.count) throw new ConflictException("This revision has already been validated");
    return this.detail(key);
  }

  async publish(
    actor: CurrentUser,
    key: string,
    input: z.infer<typeof publishPromptRevisionSchema>,
  ) {
    this.requireRole(actor, publishers);
    this.definition(key);
    if (input.revisionId) {
      const revision = await this.revision(key, input.revisionId);
      if (revision.status !== "VALIDATED")
        throw new ConflictException("Only a validated revision can be published");
    }
    await this.db.$transaction(async (tx) => {
      const current = await tx.aiPrompt.upsert({ where: { key }, create: { key }, update: {} });
      if (current.generation !== input.expectedGeneration)
        throw new ConflictException(
          "Another administrator published a change. Reload before publishing.",
        );
      const result = await tx.aiPrompt.updateMany({
        where: { key, generation: input.expectedGeneration },
        data: { activeRevisionId: input.revisionId, generation: { increment: 1 } },
      });
      if (!result.count)
        throw new ConflictException(
          "Another administrator published a change. Reload before publishing.",
        );
      await tx.aiPromptPublication.create({
        data: {
          promptKey: key,
          revisionId: input.revisionId,
          previousRevisionId: current.activeRevisionId,
          action: input.action,
          note: input.note,
          actorId: actor.id,
        },
      });
    });
    // Admin sees its publication immediately; client API and workers poll within 30 seconds.
    await refreshAiPrompts().catch(() => undefined);
    return this.detail(key);
  }
}
