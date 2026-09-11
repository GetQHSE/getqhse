import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import {
  createAiKnowledgeExampleSchema,
  listAiKnowledgeExamplesSchema,
  updateAiKnowledgeExampleSchema,
} from "@qhse/contracts";
import type { ZodType } from "zod";

import type { AdminRequest } from "../../common/request-context.js";
import { KnowledgeLibraryService } from "./knowledge-library.service.js";

@ApiTags("knowledge")
@ApiCookieAuth()
@Controller("v1/knowledge/examples")
export class KnowledgeLibraryController {
  constructor(
    @Inject(KnowledgeLibraryService)
    private readonly knowledge: KnowledgeLibraryService,
  ) {}

  @Get()
  list(@Req() request: AdminRequest, @Query() query: Record<string, unknown>) {
    return this.knowledge.list(request.platformUser!, parse(listAiKnowledgeExamplesSchema, query));
  }

  @Post()
  create(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.knowledge.create(
      request.platformUser!,
      parse(createAiKnowledgeExampleSchema, body),
    );
  }

  @Get(":id")
  detail(@Req() request: AdminRequest, @Param("id") id: string) {
    return this.knowledge.detail(request.platformUser!, id);
  }

  @Patch(":id")
  update(@Req() request: AdminRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.knowledge.update(
      request.platformUser!,
      id,
      parse(updateAiKnowledgeExampleSchema, body),
    );
  }

  @Post(":id/approve")
  approve(@Req() request: AdminRequest, @Param("id") id: string) {
    return this.knowledge.approve(request.platformUser!, id);
  }

  @Post(":id/retry-embedding")
  retryEmbedding(@Req() request: AdminRequest, @Param("id") id: string) {
    return this.knowledge.retryEmbedding(request.platformUser!, id);
  }

  @Delete(":id")
  delete(@Req() request: AdminRequest, @Param("id") id: string) {
    return this.knowledge.delete(request.platformUser!, id);
  }
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new UnprocessableEntityException({
      message: "Request validation failed",
      issues: result.error.issues,
    });
  }
  return result.data;
}
