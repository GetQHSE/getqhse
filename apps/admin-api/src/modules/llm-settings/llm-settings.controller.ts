import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiTags } from "@nestjs/swagger";

import type { AdminRequest } from "../../common/request-context.js";
import {
  llmPromptCacheRetentions,
  llmReasoningEfforts,
  llmServiceTiers,
  llmTextVerbosities,
  providerHealthCheckSchema,
  updateLlmSettingsSchema,
  type LlmSettingsView,
  type ProviderHealthCheckResult,
} from "./llm-settings.contracts.js";
import { languageProviderSchema } from "@qhse/config";
import { LlmSettingsService } from "./llm-settings.service.js";

@ApiTags("llm-settings")
@ApiCookieAuth()
@Controller("v1/llm-settings")
export class LlmSettingsController {
  constructor(
    @Inject(LlmSettingsService)
    private readonly settings: LlmSettingsService,
  ) {}

  @Get()
  read(): Promise<LlmSettingsView> {
    return this.settings.read();
  }

  @Post("providers/:provider/test")
  testProvider(
    @Req() request: AdminRequest,
    @Param("provider") providerValue: string,
    @Body() body: unknown,
  ): Promise<ProviderHealthCheckResult> {
    const provider = languageProviderSchema.safeParse(providerValue);
    const input = providerHealthCheckSchema.safeParse(body);
    if (!provider.success || !input.success) {
      throw new UnprocessableEntityException({ message: "Request validation failed" });
    }
    return this.settings.testProvider(request.platformUser!, provider.data, input.data);
  }

  @Put()
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      description:
        "Every field is optional. `null` clears an override and falls back to the environment; " +
        "an omitted field is left as-is. `apiKey` is write-only and never read back.",
      properties: {
        apiKey: { type: "string", nullable: true, maxLength: 400 },
        apiKeys: {
          type: "object",
          properties: {
            openai: { type: "string", nullable: true, maxLength: 400 },
            anthropic: { type: "string", nullable: true, maxLength: 400 },
            google: { type: "string", nullable: true, maxLength: 400 },
          },
        },
        profileProvider: { type: "string", nullable: true },
        ragEnabled: { type: "boolean", nullable: true },
        profileModel: { type: "string", nullable: true, maxLength: 120 },
        transcriptionModel: { type: "string", nullable: true, maxLength: 120 },
        embeddingProvider: { type: "string", nullable: true },
        embeddingModel: { type: "string", nullable: true, maxLength: 120 },
        regulatoryProvider: { type: "string", nullable: true },
        regulatoryModel: { type: "string", nullable: true, maxLength: 120 },
        regulatoryVerificationProvider: { type: "string", nullable: true },
        regulatoryVerificationModel: { type: "string", nullable: true, maxLength: 120 },
        regulatoryServiceTier: { type: "string", nullable: true, enum: [...llmServiceTiers] },
        regulatoryTextVerbosity: { type: "string", nullable: true, enum: [...llmTextVerbosities] },
        regulatoryPromptCacheRetention: {
          type: "string",
          nullable: true,
          enum: [...llmPromptCacheRetentions],
        },
        regulatoryReasoningEffort: {
          type: "string",
          nullable: true,
          enum: [...llmReasoningEfforts],
        },
        regulatoryTimeoutMs: { type: "integer", nullable: true },
        regulatoryDraftMaxOutputTokens: { type: "integer", nullable: true },
        regulatoryVerificationMaxOutputTokens: { type: "integer", nullable: true },
        regulatoryRunBudgetUsd: { type: "number", nullable: true },
        regulatoryEvaluationBudgetUsd: { type: "number", nullable: true },
        regulatoryInputUsdPerMTok: { type: "number", nullable: true },
        regulatoryCachedInputUsdPerMTok: { type: "number", nullable: true },
        regulatoryOutputUsdPerMTok: { type: "number", nullable: true },
        regulatoryFlexRateMultiplier: { type: "number", nullable: true },
        conservativeBytesPerToken: { type: "number", nullable: true },
      },
    },
  })
  update(@Req() request: AdminRequest, @Body() body: unknown): Promise<LlmSettingsView> {
    const result = updateLlmSettingsSchema.safeParse(body);
    if (!result.success) {
      throw new UnprocessableEntityException({
        message: "Request validation failed",
        issues: result.error.issues,
      });
    }
    return this.settings.update(request.platformUser!, result.data);
  }

  @Delete()
  reset(@Req() request: AdminRequest): Promise<LlmSettingsView> {
    return this.settings.reset(request.platformUser!);
  }
}
