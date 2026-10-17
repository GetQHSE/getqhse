import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiParam, ApiTags } from "@nestjs/swagger";
import {
  createPromptRevisionSchema,
  testPromptRevisionSchema,
  validatePromptRevisionSchema,
  publishPromptRevisionSchema,
  updatePromptSourceSchema,
} from "@qhse/contracts";
import type { z } from "zod";
import type { AdminRequest } from "../../common/request-context.js";
import { AiPromptsService } from "./ai-prompts.service.js";

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new UnprocessableEntityException({
      message: "Request validation failed",
      issues: result.error.issues,
    });
  return result.data;
}

@ApiTags("ai-prompts")
@ApiCookieAuth()
@Controller("v1/ai-prompts")
export class AiPromptsController {
  constructor(@Inject(AiPromptsService) private readonly prompts: AiPromptsService) {}
  @Get() list() {
    return this.prompts.list();
  }
  @Get("source")
  source() {
    return this.prompts.source();
  }
  @Post("source")
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["source", "expectedGeneration"],
      properties: {
        source: { type: "string", enum: ["CODE", "DATABASE"] },
        expectedGeneration: { type: "integer", minimum: 0 },
      },
    },
  })
  updateSource(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.prompts.updateSource(request.platformUser!, parse(updatePromptSourceSchema, body));
  }
  @Get(":key")
  @ApiParam({ name: "key", type: String })
  detail(@Param("key") key: string) {
    return this.prompts.detail(key);
  }
  @Post(":key/revisions")
  @ApiParam({ name: "key", type: String })
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["template", "changeNote"],
      properties: {
        template: { type: "string", minLength: 1, maxLength: 30000 },
        changeNote: { type: "string", minLength: 3, maxLength: 1000 },
      },
    },
  })
  create(@Req() request: AdminRequest, @Param("key") key: string, @Body() body: unknown) {
    return this.prompts.create(request.platformUser!, key, parse(createPromptRevisionSchema, body));
  }
  @Post(":key/revisions/:id/test")
  @ApiParam({ name: "key", type: String })
  @ApiParam({ name: "id", type: String })
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["language", "context"],
      properties: {
        language: { type: "string", enum: ["fr", "en", "ar"] },
        context: { type: "string", minLength: 1, maxLength: 40000 },
        countries: {
          type: "string",
          pattern: "^[A-Z]{2}(, [A-Z]{2})*$",
          maxLength: 100,
          default: "MA",
        },
      },
    },
  })
  test(
    @Req() request: AdminRequest,
    @Param("key") key: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.prompts.test(request.platformUser!, key, id, parse(testPromptRevisionSchema, body));
  }
  @Post(":key/revisions/:id/validate")
  @ApiParam({ name: "key", type: String })
  @ApiParam({ name: "id", type: String })
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["note"],
      properties: { note: { type: "string", minLength: 8, maxLength: 1000 } },
    },
  })
  validate(
    @Req() request: AdminRequest,
    @Param("key") key: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.prompts.validate(
      request.platformUser!,
      key,
      id,
      parse(validatePromptRevisionSchema, body),
    );
  }
  @Post(":key/publish")
  @ApiParam({ name: "key", type: String })
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["revisionId", "expectedGeneration", "action", "note"],
      description:
        "RESET requires a null revisionId; PUBLISH and ROLLBACK require a validated revision.",
      properties: {
        revisionId: { type: "string", nullable: true, minLength: 1, maxLength: 100 },
        expectedGeneration: { type: "integer", minimum: 0 },
        action: { type: "string", enum: ["PUBLISH", "ROLLBACK", "RESET"] },
        note: { type: "string", minLength: 3, maxLength: 1000 },
      },
    },
  })
  publish(@Req() request: AdminRequest, @Param("key") key: string, @Body() body: unknown) {
    return this.prompts.publish(
      request.platformUser!,
      key,
      parse(publishPromptRevisionSchema, body),
    );
  }
}
