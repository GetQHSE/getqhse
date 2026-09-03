import { createHash, randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type {
  ImportProjectProfile,
  PortableProjectProfile,
  Project,
  ProjectProfile,
  ProjectProfileChatRequest,
  ProjectProfileStreamRequest,
  UpdateProjectProfile,
} from "@qhse/contracts";
import { llmSettings } from "@qhse/ai";
import { createPrismaClient, Prisma, type DatabaseClient } from "@qhse/database";
import {
  PROFILE_SCHEMA_VERSION,
  calculateProfileCompletion,
  getNextProfileQuestion,
  parseProfileToolAnswer,
  profileFieldKeys,
  profileQuestionByKey,
  validateProfileFieldValue,
  type ProfileFieldKey,
  type ProfileFieldSource,
  type ProfileToolAnswer,
} from "@qhse/profile";

import type { TenantContext } from "../../../common/request-context.js";
import { FileStorage } from "../../files/application/file-storage.port.js";
import { ProfileChatModelPort, type ProfileChatToolResult } from "./profile-chat-model.port.js";

type AnswerInput = {
  key: ProfileFieldKey;
  value?: unknown;
  status: "ANSWERED" | "NOT_APPLICABLE";
  notApplicableReason?: string | undefined;
  confidence?: number | undefined;
};

type ApplyAnswerOptions = {
  expectedRevision?: number | undefined;
  source: ProfileFieldSource;
  sourceMessageId?: string | undefined;
  changeReason?: string | undefined;
  language?: "fr" | "ar" | undefined;
  finalize?: {
    data: Prisma.InputJsonValue;
    contentHash: string;
    completenessPercent: number;
    regulatoryReadiness: number;
  };
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === undefined || value === null ? Prisma.JsonNull : value;
}

function toProjectContract(project: {
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  entityType: string;
  countryCode: string;
  standardCode: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  activities: Array<{ id: string; name: string; isPrimary: boolean }>;
}): Project {
  return {
    ...project,
    entityType: project.entityType as Project["entityType"],
    countryCode: project.countryCode as Project["countryCode"],
    standardCode: "ISO_9001",
    status: project.status as Project["status"],
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function canEdit(role: string): boolean {
  return !["viewer", "read_only"].includes(role.toLowerCase());
}

@Injectable()
export class ProjectProfilesService {
  private readonly database: DatabaseClient;

  constructor(
    @Inject(ProfileChatModelPort) private readonly chatModel: ProfileChatModelPort,
    @Inject(FileStorage) private readonly fileStorage: FileStorage,
    @Optional() database?: DatabaseClient,
  ) {
    this.database = database ?? createPrismaClient();
  }

  private assertEditable(tenant: TenantContext): void {
    if (!canEdit(tenant.role)) throw new ForbiddenException("Profile edit access is required");
  }

  private async findProject(tenant: TenantContext, projectIdOrSlug: string) {
    const project = await this.database.project.findFirst({
      where: {
        organizationId: tenant.organizationId,
        archivedAt: null,
        OR: [{ id: projectIdOrSlug }, { slug: projectIdOrSlug }],
      },
      include: {
        activities: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        profile: { include: { fields: true } },
      },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  private async initializeProfile(tenant: TenantContext, projectIdOrSlug: string) {
    const project = await this.findProject(tenant, projectIdOrSlug);
    const profile =
      project.profile ??
      (await this.database.projectProfile.create({
        data: { projectId: project.id, schemaVersion: PROFILE_SCHEMA_VERSION },
      }));
    const seeds: Array<{
      profileId: string;
      key: string;
      value: Prisma.InputJsonValue;
      status: "ANSWERED";
      source: "ONBOARDING";
    }> = [
      {
        profileId: profile.id,
        key: "project.name",
        value: project.name,
        status: "ANSWERED",
        source: "ONBOARDING",
      },
      {
        profileId: profile.id,
        key: "scope.operatingCountries",
        value: [project.countryCode],
        status: "ANSWERED",
        source: "ONBOARDING",
      },
    ];
    if (project.logoUrl) {
      seeds.push({
        profileId: profile.id,
        key: "project.logoUrl",
        value: project.logoUrl,
        status: "ANSWERED",
        source: "ONBOARDING",
      });
    }
    await this.database.$transaction([
      this.database.projectProfileField.createMany({ data: seeds, skipDuplicates: true }),
      this.database.project.updateMany({
        where: { id: project.id, status: "EMPTY" },
        data: { status: "PROFILE_IN_PROGRESS" },
      }),
    ]);
    return profile.id;
  }

  private async buildProfile(
    tenant: TenantContext,
    projectIdOrSlug: string,
    language: "fr" | "ar" = "fr",
  ): Promise<ProjectProfile> {
    await this.initializeProfile(tenant, projectIdOrSlug);
    const project = await this.findProject(tenant, projectIdOrSlug);
    const profile = project.profile!;
    const persistedByKey = new Map(profile.fields.map((field) => [field.key, field]));
    const fields = profileFieldKeys.map((key) => {
      const field = persistedByKey.get(key);
      return {
        id: field?.id ?? null,
        key,
        value: field?.value ?? null,
        status: field?.status ?? "UNANSWERED",
        source: field?.source ?? null,
        confidence: field?.confidence ?? null,
        notApplicableReason: field?.notApplicableReason ?? null,
        confirmedAt: field?.confirmedAt?.toISOString() ?? null,
        updatedAt: field?.updatedAt?.toISOString() ?? null,
      };
    });
    const completion = calculateProfileCompletion(fields);
    if (
      profile.completenessPercent !== completion.completenessPercent ||
      profile.regulatoryReadiness !== completion.regulatoryReadiness
    ) {
      await this.database.projectProfile.update({
        where: { id: profile.id },
        data: {
          completenessPercent: completion.completenessPercent,
          regulatoryReadiness: completion.regulatoryReadiness,
        },
      });
    }
    return {
      project: toProjectContract(project),
      profile: {
        id: profile.id,
        schemaVersion: profile.schemaVersion,
        revision: profile.revision,
        status: profile.status,
        completedAt: profile.completedAt?.toISOString() ?? null,
        lastReviewedAt: profile.lastReviewedAt?.toISOString() ?? null,
        nextReviewAt: profile.nextReviewAt?.toISOString() ?? null,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
      },
      fields,
      completion,
      nextQuestion: getNextProfileQuestion(fields, language),
    };
  }

  get(tenant: TenantContext, projectIdOrSlug: string): Promise<ProjectProfile> {
    return this.buildProfile(tenant, projectIdOrSlug);
  }

  private validateAnswers(answers: AnswerInput[]): AnswerInput[] {
    const unique = new Set<ProfileFieldKey>();
    return answers.map((answer) => {
      if (unique.has(answer.key)) {
        throw new BadRequestException(`Duplicate profile field: ${answer.key}`);
      }
      unique.add(answer.key);
      if (answer.status === "NOT_APPLICABLE") {
        if (!profileQuestionByKey.get(answer.key)?.allowNotApplicable) {
          throw new BadRequestException(`${answer.key} cannot be marked not applicable`);
        }
        if (!answer.notApplicableReason?.trim()) {
          throw new BadRequestException(`A reason is required for ${answer.key}`);
        }
        return answer;
      }
      const parsed = validateProfileFieldValue(answer.key, answer.value);
      if (!parsed.success) {
        throw new BadRequestException({
          message: `Invalid value for ${answer.key}`,
          issues: parsed.error.issues,
        });
      }
      return { ...answer, value: parsed.data };
    });
  }

  private async applyAnswers(
    tenant: TenantContext,
    projectIdOrSlug: string,
    answersInput: AnswerInput[],
    options: ApplyAnswerOptions,
  ): Promise<ProjectProfile> {
    const answers = this.validateAnswers(answersInput);
    await this.initializeProfile(tenant, projectIdOrSlug);
    await this.database.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: {
          organizationId: tenant.organizationId,
          archivedAt: null,
          OR: [{ id: projectIdOrSlug }, { slug: projectIdOrSlug }],
        },
        include: { profile: { include: { fields: true } } },
      });
      if (!project?.profile) throw new NotFoundException("Project profile not found");
      const profile = project.profile;
      if (options.expectedRevision && profile.revision !== options.expectedRevision) {
        throw new ConflictException({
          message: "The profile was changed by another request",
          currentRevision: profile.revision,
        });
      }
      const finalizedAt = options.finalize ? new Date() : null;
      const nextReviewAt = finalizedAt ? new Date(finalizedAt) : null;
      nextReviewAt?.setUTCFullYear(nextReviewAt.getUTCFullYear() + 1);
      const claimed = await tx.projectProfile.updateMany({
        where: { id: profile.id, revision: profile.revision },
        data: {
          revision: { increment: 1 },
          status: options.finalize
            ? "COMPLETE"
            : profile.status === "COMPLETE"
              ? "STALE"
              : "IN_PROGRESS",
          completedAt: options.finalize
            ? finalizedAt
            : profile.status === "COMPLETE"
              ? null
              : profile.completedAt,
          ...(options.finalize ? { lastReviewedAt: finalizedAt, nextReviewAt } : {}),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("The profile was changed by another request");
      }
      if (profile.status === "COMPLETE") {
        await tx.projectRegulatoryWatch.updateMany({
          where: { projectId: project.id, currentBaselineId: { not: null } },
          data: { status: "STALE", revision: { increment: 1 } },
        });
      }

      const existingByKey = new Map(profile.fields.map((field) => [field.key, field]));
      for (const answer of answers) {
        const existing = existingByKey.get(answer.key);
        const newStatus = options.source === "USER_EDIT" ? "CONFIRMED" : answer.status;
        const value =
          answer.status === "NOT_APPLICABLE" ? Prisma.JsonNull : jsonValue(answer.value);
        const field = await tx.projectProfileField.upsert({
          where: { profileId_key: { profileId: profile.id, key: answer.key } },
          create: {
            profileId: profile.id,
            key: answer.key,
            value,
            status: newStatus,
            source: options.source,
            confidence: answer.confidence ?? null,
            sourceMessageId: options.sourceMessageId ?? null,
            notApplicableReason: answer.notApplicableReason?.trim() ?? null,
            confirmedById: options.source === "USER_EDIT" ? tenant.userId : null,
            confirmedAt: options.source === "USER_EDIT" ? new Date() : null,
          },
          update: {
            value,
            status: newStatus,
            source: options.source,
            confidence: answer.confidence ?? null,
            sourceMessageId: options.sourceMessageId ?? null,
            notApplicableReason: answer.notApplicableReason?.trim() ?? null,
            confirmedById: options.source === "USER_EDIT" ? tenant.userId : null,
            confirmedAt: options.source === "USER_EDIT" ? new Date() : null,
          },
        });
        await tx.projectProfileFieldRevision.create({
          data: {
            fieldId: field.id,
            previousValue: existing?.value ?? Prisma.JsonNull,
            newValue: value,
            previousStatus: existing?.status ?? null,
            newStatus,
            source: options.source,
            changedById: tenant.userId,
            sourceMessageId: options.sourceMessageId ?? null,
            changeReason: options.changeReason?.trim() || null,
          },
        });

        if (answer.key === "project.name" && typeof answer.value === "string") {
          await tx.project.update({
            where: { id: project.id },
            data: { name: answer.value.trim() },
          });
        }
        if (answer.key === "project.logoUrl") {
          await tx.project.update({
            where: { id: project.id },
            data: {
              logoUrl: answer.status === "NOT_APPLICABLE" ? null : (answer.value as string | null),
            },
          });
        }
      }
      await tx.project.update({
        where: { id: project.id },
        data: {
          status: options.finalize
            ? "READY_FOR_ANALYSIS"
            : profile.status === "COMPLETE"
              ? "REVIEW_REQUIRED"
              : "PROFILE_IN_PROGRESS",
        },
      });
      if (options.finalize) {
        const existingSnapshot = await tx.projectProfileSnapshot.findUnique({
          where: {
            profileId_contentHash: {
              profileId: profile.id,
              contentHash: options.finalize.contentHash,
            },
          },
        });
        if (!existingSnapshot) {
          await tx.projectProfileSnapshot.create({
            data: {
              profileId: profile.id,
              sequence:
                (await tx.projectProfileSnapshot.count({ where: { profileId: profile.id } })) + 1,
              schemaVersion: PROFILE_SCHEMA_VERSION,
              data: options.finalize.data,
              contentHash: options.finalize.contentHash,
              completenessPercent: options.finalize.completenessPercent,
              regulatoryReadiness: options.finalize.regulatoryReadiness,
              createdById: tenant.userId,
            },
          });
        }
        await tx.projectProfileConversation.updateMany({
          where: { profileId: profile.id, status: "ACTIVE" },
          data: { status: "COMPLETED", currentQuestionKey: null },
        });
      }
    });
    return this.buildProfile(tenant, projectIdOrSlug, options.language);
  }

  async update(
    tenant: TenantContext,
    projectIdOrSlug: string,
    input: UpdateProjectProfile,
  ): Promise<ProjectProfile> {
    this.assertEditable(tenant);
    return this.applyAnswers(tenant, projectIdOrSlug, input.answers, {
      expectedRevision: input.revision,
      source: "USER_EDIT",
      changeReason: input.changeReason,
    });
  }

  async exportPortable(
    tenant: TenantContext,
    projectIdOrSlug: string,
  ): Promise<PortableProjectProfile> {
    const profile = await this.buildProfile(tenant, projectIdOrSlug);
    const fields: PortableProjectProfile["fields"] = [];
    for (const field of profile.fields) {
      if (field.status === "NOT_APPLICABLE") {
        fields.push({
          key: field.key,
          status: "NOT_APPLICABLE",
          notApplicableReason:
            field.notApplicableReason ?? "Information non applicable au projet source",
        });
        continue;
      }
      if (!["ANSWERED", "CONFIRMED"].includes(field.status) || field.value === null) continue;
      fields.push({ key: field.key, status: "ANSWERED", value: field.value });
    }
    return {
      format: "qhse-project-profile",
      formatVersion: 1,
      profileSchemaVersion: profile.profile.schemaVersion,
      exportedAt: new Date().toISOString(),
      sourceProject: {
        name: profile.project.name,
        countryCode: profile.project.countryCode,
        standardCode: "ISO_9001",
      },
      fields,
    };
  }

  async importPortable(
    tenant: TenantContext,
    projectIdOrSlug: string,
    input: ImportProjectProfile,
  ): Promise<ProjectProfile> {
    this.assertEditable(tenant);
    if (input.document.profileSchemaVersion !== PROFILE_SCHEMA_VERSION) {
      throw new BadRequestException({
        message: "Unsupported project profile schema version",
        expected: PROFILE_SCHEMA_VERSION,
        received: input.document.profileSchemaVersion,
      });
    }
    const current = await this.buildProfile(tenant, projectIdOrSlug);
    if (current.profile.revision !== input.revision) {
      throw new ConflictException({
        message: "The profile was changed by another request",
        currentRevision: current.profile.revision,
      });
    }
    const answers: AnswerInput[] = input.document.fields.map((field) => ({
      key: field.key,
      status: field.status,
      ...(field.status === "ANSWERED" ? { value: field.value } : {}),
      ...(field.notApplicableReason ? { notApplicableReason: field.notApplicableReason } : {}),
    }));
    const importedByKey = new Map(answers.map((answer) => [answer.key, answer]));
    const mergedFields = current.fields.map((field) => {
      const imported = importedByKey.get(field.key);
      if (!imported) return field;
      return {
        ...field,
        status: imported.status,
        value: imported.status === "NOT_APPLICABLE" ? null : (imported.value ?? null),
        notApplicableReason: imported.notApplicableReason ?? null,
      };
    });
    const completion = calculateProfileCompletion(mergedFields);
    if (completion.completenessPercent !== 100 || completion.regulatoryReadiness !== 100) {
      throw new BadRequestException({
        message: "The imported file does not complete the project profile",
        missingRequiredKeys: completion.missingRequiredKeys,
        missingRegulatoryKeys: completion.missingRegulatoryKeys,
      });
    }
    const project = { ...current.project };
    const importedName = importedByKey.get("project.name");
    if (importedName?.status === "ANSWERED" && typeof importedName.value === "string") {
      project.name = importedName.value.trim();
    }
    const importedLogo = importedByKey.get("project.logoUrl");
    if (importedLogo) {
      project.logoUrl =
        importedLogo.status === "ANSWERED" && typeof importedLogo.value === "string"
          ? importedLogo.value
          : null;
    }
    const snapshotData = {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      project,
      fields: Object.fromEntries(mergedFields.map((field) => [field.key, field.value])),
    };
    return this.applyAnswers(tenant, projectIdOrSlug, answers, {
      expectedRevision: input.revision,
      source: "IMPORTED",
      changeReason: `Import JSON depuis ${input.document.sourceProject.name}`,
      finalize: {
        data: snapshotData as Prisma.InputJsonValue,
        contentHash: sha256(JSON.stringify(snapshotData)),
        completenessPercent: completion.completenessPercent,
        regulatoryReadiness: completion.regulatoryReadiness,
      },
    });
  }

  async getConversation(tenant: TenantContext, projectIdOrSlug: string, conversationId?: string) {
    const profile = await this.buildProfile(tenant, projectIdOrSlug);
    const conversation = await this.database.projectProfileConversation.findFirst({
      where: {
        profileId: profile.profile.id,
        ...(conversationId ? { id: conversationId } : { status: "ACTIVE" }),
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: { attachments: { include: { file: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!conversation) return null;
    return {
      id: conversation.id,
      status: conversation.status,
      language: conversation.language as "fr" | "ar",
      currentQuestionKey: conversation.currentQuestionKey as ProfileFieldKey | null,
      messages: conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        clientMessageId: message.clientMessageId,
        replyToMessageId: message.replyToMessageId,
        attachments: message.attachments.map(({ file }) => ({
          id: file.id,
          fileName: file.originalName,
          contentType: file.contentType,
          sizeBytes: Number(file.sizeBytes),
          purpose: file.purpose,
        })),
        createdAt: message.createdAt.toISOString(),
      })),
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };
  }

  private async getOrCreateConversation(
    tenant: TenantContext,
    profile: ProjectProfile,
    request: ProjectProfileChatRequest,
  ) {
    if (request.conversationId) {
      const existing = await this.database.projectProfileConversation.findFirst({
        where: { id: request.conversationId, profileId: profile.profile.id, status: "ACTIVE" },
      });
      if (!existing) throw new NotFoundException("Active profile conversation not found");
      return existing;
    }
    const active = await this.database.projectProfileConversation.findFirst({
      where: { profileId: profile.profile.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    if (active) return active;
    return this.database.projectProfileConversation.create({
      data: {
        profileId: profile.profile.id,
        createdById: tenant.userId,
        language: request.language,
        currentQuestionKey: profile.nextQuestion?.key ?? null,
      },
    });
  }

  async chat(tenant: TenantContext, projectIdOrSlug: string, request: ProjectProfileChatRequest) {
    this.assertEditable(tenant);
    this.assertProfileModule(request.module);
    let profile = await this.buildProfile(tenant, projectIdOrSlug, request.language);
    const conversation = await this.getOrCreateConversation(tenant, profile, request);
    if (request.messageId) {
      const previous = await this.database.projectProfileMessage.findFirst({
        where: { conversationId: conversation.id, clientMessageId: request.messageId },
      });
      if (previous) {
        const reply = await this.database.projectProfileMessage.findFirst({
          where: { conversationId: conversation.id, replyToMessageId: previous.id },
          orderBy: { createdAt: "desc" },
        });
        if (!reply) throw new ConflictException("This chat turn is already being processed");
        return {
          conversationId: conversation.id,
          message: {
            id: reply.id,
            role: reply.role,
            content: reply.content,
            clientMessageId: reply.clientMessageId,
            replyToMessageId: reply.replyToMessageId,
            attachments: [],
            createdAt: reply.createdAt.toISOString(),
          },
          acceptedKeys: [],
          rejectedAnswers: [],
          profile,
        };
      }
    }
    const turnContext = await this.prepareTurnContext(
      tenant,
      conversation.id,
      request.message,
      request.attachmentIds,
    );
    const userMessage = await this.database.projectProfileMessage.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: request.message,
        clientMessageId: request.messageId ?? null,
        attachments: {
          create: turnContext.files.map((file) => ({ fileId: file.id })),
        },
      },
    });
    const projectId = profile.project.id;
    const modelName = llmSettings().profileModel;
    const invocation = await this.database.aiInvocation.create({
      data: {
        organizationId: tenant.organizationId,
        projectId,
        profileId: profile.profile.id,
        conversationId: conversation.id,
        module: "PROFILE_COMPLETION",
        task: "CHAT_TURN",
        promptKey: "profile.chat",
        promptVersion: 1,
        model: modelName,
        inputSchemaVersion: PROFILE_SCHEMA_VERSION,
        inputHash: sha256(
          `${profile.profile.revision}:${request.message}:${request.attachmentIds.join(",")}`,
        ),
      },
    });
    const startedAt = Date.now();
    const accepted = new Set<ProfileFieldKey>();
    const rejected: Array<{ key: ProfileFieldKey; reason: string }> = [];

    try {
      const result = await this.chatModel.runTurn({
        language: request.language,
        userMessage: turnContext.modelMessage,
        currentQuestion: profile.nextQuestion
          ? { key: profile.nextQuestion.key, prompt: profile.nextQuestion.prompt }
          : null,
        profileRevision: profile.profile.revision,
        completenessPercent: profile.completion.completenessPercent,
        regulatoryReadiness: profile.completion.regulatoryReadiness,
        knownFields: profile.fields
          .filter((field) => field.status !== "UNANSWERED")
          .map((field) => ({ key: field.key, value: field.value, status: field.status })),
        history: turnContext.history,
        attachments: turnContext.attachments,
        recordAnswers: async (answers: ProfileToolAnswer[]): Promise<ProfileChatToolResult> => {
          const valid: AnswerInput[] = [];
          for (const answer of answers) {
            const parsed = parseProfileToolAnswer(answer);
            if (parsed.success) {
              valid.push({
                key: parsed.key,
                value: parsed.value,
                status: "ANSWERED",
                confidence: parsed.confidence,
              });
              accepted.add(parsed.key);
            } else {
              rejected.push({ key: answer.key, reason: parsed.error });
            }
          }
          if (valid.length) {
            profile = await this.applyAnswers(tenant, projectId, valid, {
              source: "USER_CHAT",
              sourceMessageId: userMessage.id,
              language: request.language,
            });
          }
          return {
            acceptedKeys: valid.map((answer) => answer.key),
            rejectedAnswers: rejected,
            nextQuestion: profile.nextQuestion
              ? { key: profile.nextQuestion.key, prompt: profile.nextQuestion.prompt }
              : null,
            completenessPercent: profile.completion.completenessPercent,
            regulatoryReadiness: profile.completion.regulatoryReadiness,
          };
        },
      });
      profile = await this.buildProfile(tenant, projectId, request.language);
      const fallback = profile.nextQuestion
        ? `Merci. ${profile.nextQuestion.prompt}`
        : "Merci. Votre profil est prêt à être vérifié et finalisé.";
      const assistantMessage = await this.database.projectProfileMessage.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: result.text || fallback,
          replyToMessageId: userMessage.id,
          model: result.model,
          promptKey: result.promptKey,
          promptVersion: result.promptVersion,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      });
      await this.database.$transaction([
        this.database.projectProfileConversation.update({
          where: { id: conversation.id },
          data: { currentQuestionKey: profile.nextQuestion?.key ?? null },
        }),
        this.database.aiInvocation.update({
          where: { id: invocation.id },
          data: {
            status: "COMPLETED",
            model: result.model,
            promptKey: result.promptKey,
            promptVersion: result.promptVersion,
            outputHash: sha256(assistantMessage.content),
            toolNames: result.toolNames,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            latencyMs: Date.now() - startedAt,
            completedAt: new Date(),
          },
        }),
      ]);
      return {
        conversationId: conversation.id,
        message: {
          id: assistantMessage.id,
          role: assistantMessage.role,
          content: assistantMessage.content,
          clientMessageId: assistantMessage.clientMessageId,
          replyToMessageId: assistantMessage.replyToMessageId,
          attachments: [],
          createdAt: assistantMessage.createdAt.toISOString(),
        },
        acceptedKeys: [...accepted],
        rejectedAnswers: rejected,
        profile,
      };
    } catch (error) {
      await this.database.aiInvocation.update({
        where: { id: invocation.id },
        data: {
          status: "FAILED",
          errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
          latencyMs: Date.now() - startedAt,
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async streamChat(
    tenant: TenantContext,
    projectIdOrSlug: string,
    request: ProjectProfileStreamRequest,
  ) {
    this.assertEditable(tenant);
    this.assertProfileModule(request.module);
    const latestUser = [...request.messages].reverse().find((message) => message.role === "user");
    const message = latestUser?.parts
      .filter(
        (part): part is Extract<(typeof latestUser.parts)[number], { type: "text" }> =>
          part.type === "text",
      )
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join("\n");
    if (!latestUser || !message) throw new BadRequestException("A user text message is required");
    const clientMessageId = request.messageId ?? latestUser.id;
    let profile = await this.buildProfile(tenant, projectIdOrSlug, request.language);
    const conversation = await this.getOrCreateConversation(tenant, profile, {
      message,
      messageId: clientMessageId,
      conversationId: request.conversationId,
      language: request.language,
      module: request.module,
      attachmentIds: request.attachmentIds,
    });
    const previous = await this.database.projectProfileMessage.findFirst({
      where: { conversationId: conversation.id, clientMessageId },
    });
    if (previous) {
      const reply = await this.database.projectProfileMessage.findFirst({
        where: { conversationId: conversation.id, replyToMessageId: previous.id },
        orderBy: { createdAt: "desc" },
      });
      if (!reply) throw new ConflictException("This chat turn is already being processed");
      return this.replayStream(reply.id, reply.content);
    }
    const turnContext = await this.prepareTurnContext(
      tenant,
      conversation.id,
      message,
      request.attachmentIds,
    );
    const userMessage = await this.database.projectProfileMessage.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: message,
        clientMessageId,
        attachments: { create: turnContext.files.map((file) => ({ fileId: file.id })) },
      },
    });
    const assistantMessageId = randomUUID();
    const modelName = llmSettings().profileModel;
    const invocation = await this.database.aiInvocation.create({
      data: {
        organizationId: tenant.organizationId,
        projectId: profile.project.id,
        profileId: profile.profile.id,
        conversationId: conversation.id,
        module: "PROFILE_COMPLETION",
        task: "CHAT_TURN_STREAM",
        promptKey: "profile.chat",
        promptVersion: 1,
        model: modelName,
        inputSchemaVersion: PROFILE_SCHEMA_VERSION,
        inputHash: sha256(
          `${profile.profile.revision}:${message}:${request.attachmentIds.join(",")}`,
        ),
      },
    });
    const startedAt = Date.now();

    return this.chatModel.streamTurn({
      language: request.language,
      userMessage: turnContext.modelMessage,
      currentQuestion: profile.nextQuestion
        ? { key: profile.nextQuestion.key, prompt: profile.nextQuestion.prompt }
        : null,
      profileRevision: profile.profile.revision,
      completenessPercent: profile.completion.completenessPercent,
      regulatoryReadiness: profile.completion.regulatoryReadiness,
      knownFields: profile.fields
        .filter((field) => field.status !== "UNANSWERED")
        .map((field) => ({ key: field.key, value: field.value, status: field.status })),
      history: turnContext.history,
      attachments: turnContext.attachments,
      responseMessageId: assistantMessageId,
      recordAnswers: async (answers: ProfileToolAnswer[]): Promise<ProfileChatToolResult> => {
        const valid: AnswerInput[] = [];
        const rejectedAnswers: Array<{ key: ProfileFieldKey; reason: string }> = [];
        for (const answer of answers) {
          const parsed = parseProfileToolAnswer(answer);
          if (parsed.success) {
            valid.push({
              key: parsed.key,
              value: parsed.value,
              status: "ANSWERED",
              confidence: parsed.confidence,
            });
          } else {
            rejectedAnswers.push({ key: answer.key, reason: parsed.error });
          }
        }
        if (valid.length) {
          profile = await this.applyAnswers(tenant, profile.project.id, valid, {
            source: "USER_CHAT",
            sourceMessageId: userMessage.id,
            language: request.language,
          });
        }
        return {
          acceptedKeys: valid.map((answer) => answer.key),
          rejectedAnswers,
          nextQuestion: profile.nextQuestion
            ? { key: profile.nextQuestion.key, prompt: profile.nextQuestion.prompt }
            : null,
          completenessPercent: profile.completion.completenessPercent,
          regulatoryReadiness: profile.completion.regulatoryReadiness,
        };
      },
      onComplete: async (result) => {
        profile = await this.buildProfile(tenant, profile.project.id, request.language);
        const fallback = profile.nextQuestion
          ? `Merci. ${profile.nextQuestion.prompt}`
          : "Merci. Votre profil est prêt à être vérifié et finalisé.";
        const assistant = await this.database.projectProfileMessage.create({
          data: {
            id: assistantMessageId,
            conversationId: conversation.id,
            role: "ASSISTANT",
            content: result.text || fallback,
            replyToMessageId: userMessage.id,
            model: result.model,
            promptKey: result.promptKey,
            promptVersion: result.promptVersion,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
          },
        });
        await this.database.$transaction([
          this.database.projectProfileConversation.update({
            where: { id: conversation.id },
            data: { currentQuestionKey: profile.nextQuestion?.key ?? null },
          }),
          this.database.aiInvocation.update({
            where: { id: invocation.id },
            data: {
              status: "COMPLETED",
              model: result.model,
              promptKey: result.promptKey,
              promptVersion: result.promptVersion,
              outputHash: sha256(assistant.content),
              toolNames: result.toolNames,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              latencyMs: Date.now() - startedAt,
              completedAt: new Date(),
            },
          }),
        ]);
      },
      onError: async (error) => {
        await this.database.aiInvocation.updateMany({
          where: { id: invocation.id, status: "RUNNING" },
          data: {
            status: "FAILED",
            errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
            latencyMs: Date.now() - startedAt,
            completedAt: new Date(),
          },
        });
      },
    });
  }

  private replayStream(messageId: string, content: string) {
    return {
      pipe: async (response: ServerResponse) => {
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
          "x-vercel-ai-ui-message-stream": "v1",
          "x-accel-buffering": "no",
        });
        const textId = `text-${messageId}`;
        for (const chunk of [
          { type: "start", messageId },
          { type: "text-start", id: textId },
          { type: "text-delta", id: textId, delta: content },
          { type: "text-end", id: textId },
          { type: "finish", finishReason: "stop" },
        ]) {
          response.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        response.end("data: [DONE]\n\n");
      },
    };
  }

  private assertProfileModule(module: ProjectProfileChatRequest["module"]): void {
    if (module !== "PROFILE_COMPLETION") {
      throw new BadRequestException(
        "This endpoint handles profile completion only; normative watch has its own module",
      );
    }
  }

  private async prepareTurnContext(
    tenant: TenantContext,
    conversationId: string,
    message: string,
    attachmentIds: string[],
  ) {
    const files = attachmentIds.length
      ? await this.database.fileObject.findMany({
          where: {
            id: { in: attachmentIds },
            organizationId: tenant.organizationId,
            uploadStatus: "READY",
            deletedAt: null,
          },
          include: { transcriptions: { where: { status: "COMPLETED" } } },
        })
      : [];
    if (files.length !== new Set(attachmentIds).size) {
      throw new BadRequestException(
        "One or more attachments are missing, unverified, or inaccessible",
      );
    }
    const attachmentById = new Map(files.map((file) => [file.id, file]));
    const orderedFiles = attachmentIds.map((id) => attachmentById.get(id)!);
    const transcriptSections: string[] = [];
    const attachments: Array<{
      fileId: string;
      fileName: string;
      contentType: string;
      url: string;
    }> = [];
    for (const file of orderedFiles) {
      if (file.purpose === "VOICE_NOTE") {
        const transcript = file.transcriptions.find((item) => item.text?.trim());
        if (!transcript?.text) {
          throw new BadRequestException(
            `Voice note ${file.originalName} must be transcribed before it can be sent`,
          );
        }
        transcriptSections.push(`[Voice note: ${file.originalName}]\n${transcript.text}`);
      } else {
        attachments.push({
          fileId: file.id,
          fileName: file.originalName,
          contentType: file.contentType,
          url: await this.fileStorage.createDownloadUrl(tenant.organizationId, file.objectKey),
        });
      }
    }
    const recent = await this.database.projectProfileMessage.findMany({
      where: { conversationId, role: { in: ["USER", "ASSISTANT"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    let characters = 0;
    const history = recent
      .reverse()
      .filter((item) => {
        characters += item.content.length;
        return characters <= 24_000;
      })
      .map((item) => ({
        role: item.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: item.content,
      }));
    return {
      files: orderedFiles,
      attachments,
      history,
      modelMessage: [message, ...transcriptSections].filter(Boolean).join("\n\n"),
    };
  }

  async complete(tenant: TenantContext, projectIdOrSlug: string, expectedRevision: number) {
    this.assertEditable(tenant);
    const profile = await this.buildProfile(tenant, projectIdOrSlug);
    if (profile.profile.revision !== expectedRevision) {
      throw new ConflictException({
        message: "The profile was changed by another request",
        currentRevision: profile.profile.revision,
      });
    }
    if (
      profile.completion.completenessPercent !== 100 ||
      profile.completion.regulatoryReadiness !== 100
    ) {
      throw new BadRequestException({
        message: "All required profile information must be completed",
        missingRequiredKeys: profile.completion.missingRequiredKeys,
        missingRegulatoryKeys: profile.completion.missingRegulatoryKeys,
      });
    }
    const data = {
      schemaVersion: profile.profile.schemaVersion,
      project: profile.project,
      fields: Object.fromEntries(profile.fields.map((field) => [field.key, field.value])),
    };
    const contentHash = sha256(JSON.stringify(data));
    const now = new Date();
    const nextReviewAt = new Date(now);
    nextReviewAt.setUTCFullYear(nextReviewAt.getUTCFullYear() + 1);
    const snapshot = await this.database.$transaction(async (tx) => {
      const claimed = await tx.projectProfile.updateMany({
        where: { id: profile.profile.id, revision: expectedRevision },
        data: {
          status: "COMPLETE",
          completedAt: now,
          lastReviewedAt: now,
          nextReviewAt,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("The profile was changed by another request");
      }
      const previous = await tx.projectProfileSnapshot.findUnique({
        where: { profileId_contentHash: { profileId: profile.profile.id, contentHash } },
      });
      const record =
        previous ??
        (await tx.projectProfileSnapshot.create({
          data: {
            profileId: profile.profile.id,
            sequence:
              (await tx.projectProfileSnapshot.count({
                where: { profileId: profile.profile.id },
              })) + 1,
            schemaVersion: profile.profile.schemaVersion,
            data: data as Prisma.InputJsonValue,
            contentHash,
            completenessPercent: profile.completion.completenessPercent,
            regulatoryReadiness: profile.completion.regulatoryReadiness,
            createdById: tenant.userId,
          },
        }));
      await tx.project.update({
        where: { id: profile.project.id },
        data: { status: "READY_FOR_ANALYSIS" },
      });
      await tx.projectProfileConversation.updateMany({
        where: { profileId: profile.profile.id, status: "ACTIVE" },
        data: { status: "COMPLETED", currentQuestionKey: null },
      });
      return record;
    });
    return {
      id: snapshot.id,
      sequence: snapshot.sequence,
      schemaVersion: snapshot.schemaVersion,
      contentHash: snapshot.contentHash,
      completenessPercent: snapshot.completenessPercent,
      regulatoryReadiness: snapshot.regulatoryReadiness,
      createdAt: snapshot.createdAt.toISOString(),
    };
  }
}
