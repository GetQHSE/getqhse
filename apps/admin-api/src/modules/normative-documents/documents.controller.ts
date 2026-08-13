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
  classificationUpdateSchema,
  createDocumentSchema,
  createVersionSchema,
  listDocumentsSchema,
  metadataDecisionSchema,
  processingRequestSchema,
  relationshipSchema,
  reviewIssueSchema,
  updateDocumentSchema,
  uploadRequestSchema,
} from "@qhse/documents";
import type { ZodType } from "zod";

import type { AdminRequest } from "../../common/request-context.js";
import { DocumentsService } from "./documents.service.js";

@ApiTags("documents")
@ApiCookieAuth()
@Controller("v1/documents")
export class DocumentsController {
  constructor(
    @Inject(DocumentsService)
    private readonly documents: DocumentsService,
  ) {}

  @Get("dashboard")
  dashboard(@Req() request: AdminRequest) {
    return this.documents.dashboard(request.platformUser!);
  }

  // Declared ahead of `@Get(":documentId")`, which would otherwise match it.
  @Get("embedding-profiles")
  profileReadiness(@Req() request: AdminRequest) {
    return this.documents.embeddingProfileReadiness(request.platformUser!);
  }

  @Get()
  list(@Req() request: AdminRequest, @Query() query: Record<string, unknown>) {
    return this.documents.list(request.platformUser!, parse(listDocumentsSchema, query));
  }

  @Post()
  create(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.documents.create(
      request.platformUser!,
      parse(createDocumentSchema, body),
      request.ip,
    );
  }

  @Get(":documentId")
  get(@Req() request: AdminRequest, @Param("documentId") documentId: string) {
    return this.documents.get(request.platformUser!, documentId);
  }

  @Patch(":documentId")
  update(
    @Req() request: AdminRequest,
    @Param("documentId") documentId: string,
    @Body() body: unknown,
  ) {
    return this.documents.update(
      request.platformUser!,
      documentId,
      parse(updateDocumentSchema, body),
      request.ip,
    );
  }

  @Post(":documentId/versions")
  createVersion(
    @Req() request: AdminRequest,
    @Param("documentId") documentId: string,
    @Body() body: unknown,
  ) {
    return this.documents.createVersion(
      request.platformUser!,
      documentId,
      parse(createVersionSchema, body),
      request.ip,
    );
  }

  @Post(":documentId/versions/:versionId/upload-url")
  uploadUrl(
    @Req() request: AdminRequest,
    @Param("documentId") documentId: string,
    @Param("versionId") versionId: string,
    @Body() body: unknown,
  ) {
    return this.documents.requestUpload(
      request.platformUser!,
      documentId,
      versionId,
      parse(uploadRequestSchema, body),
      request.ip,
    );
  }

  @Post(":documentId/versions/:versionId/confirm-upload")
  confirmUpload(
    @Req() request: AdminRequest,
    @Param("documentId") documentId: string,
    @Param("versionId") versionId: string,
  ) {
    return this.documents.confirmUpload(request.platformUser!, documentId, versionId, request.ip);
  }

  @Post(":documentId/versions/:versionId/process")
  process(
    @Req() request: AdminRequest,
    @Param("documentId") documentId: string,
    @Param("versionId") versionId: string,
    @Body() body: unknown,
  ) {
    return this.documents.startProcessing(
      request.platformUser!,
      documentId,
      versionId,
      parse(processingRequestSchema, body),
      request.ip,
    );
  }

  @Post(":documentId/versions/:versionId/jobs/:jobId/retry")
  retry(
    @Req() request: AdminRequest,
    @Param("documentId") documentId: string,
    @Param("versionId") versionId: string,
    @Param("jobId") jobId: string,
  ) {
    return this.documents.retryJob(request.platformUser!, documentId, versionId, jobId, request.ip);
  }

  @Post(":documentId/versions/:versionId/issues")
  createIssue(
    @Req() request: AdminRequest,
    @Param("documentId") documentId: string,
    @Param("versionId") versionId: string,
    @Body() body: unknown,
  ) {
    return this.documents.createIssue(
      request.platformUser!,
      documentId,
      versionId,
      parse(reviewIssueSchema, body),
      request.ip,
    );
  }

  @Post(":documentId/versions/:versionId/issues/:issueId/resolve")
  resolveIssue(
    @Req() request: AdminRequest,
    @Param("documentId") documentId: string,
    @Param("versionId") versionId: string,
    @Param("issueId") issueId: string,
  ) {
    return this.documents.resolveIssue(
      request.platformUser!,
      documentId,
      versionId,
      issueId,
      request.ip,
    );
  }

  @Post(":documentId/versions/:versionId/validate")
  validate(
    @Req() request: AdminRequest,
    @Param("documentId") documentId: string,
    @Param("versionId") versionId: string,
    @Body() body: { relationshipConfirmed?: boolean },
  ) {
    return this.documents.validateVersion(
      request.platformUser!,
      documentId,
      versionId,
      body.relationshipConfirmed === true,
      request.ip,
    );
  }

  @Post(":documentId/versions/:versionId/publish")
  publish(
    @Req() request: AdminRequest,
    @Param("documentId") documentId: string,
    @Param("versionId") versionId: string,
    @Body() body: { confirmed?: boolean },
  ) {
    return this.documents.publishVersion(
      request.platformUser!,
      documentId,
      versionId,
      body.confirmed === true,
      request.ip,
    );
  }

  @Post(":documentId/versions/:versionId/reindex")
  reindex(
    @Req() request: AdminRequest,
    @Param("documentId") documentId: string,
    @Param("versionId") versionId: string,
    @Body() body: { profileId?: string } | undefined,
  ) {
    return this.documents.reindexVersion(
      request.platformUser!,
      documentId,
      versionId,
      body?.profileId,
    );
  }

  @Post("embedding-profiles")
  createProfile(@Req() request: AdminRequest) {
    return this.documents.createEmbeddingProfile(request.platformUser!);
  }

  @Post("embedding-profiles/:profileId/activate")
  activateProfile(@Req() request: AdminRequest, @Param("profileId") profileId: string) {
    return this.documents.activateEmbeddingProfile(request.platformUser!, profileId);
  }

  @Post(":documentId/archive")
  archive(@Req() request: AdminRequest, @Param("documentId") documentId: string) {
    return this.documents.archive(request.platformUser!, documentId, request.ip);
  }

  @Get(":documentId/versions/:versionId/compare/:otherVersionId")
  compare(
    @Req() request: AdminRequest,
    @Param("documentId") documentId: string,
    @Param("versionId") versionId: string,
    @Param("otherVersionId") otherVersionId: string,
  ) {
    return this.documents.compare(request.platformUser!, documentId, versionId, otherVersionId);
  }

  @Get(":documentId/files/:fileId/download")
  download(
    @Req() request: AdminRequest,
    @Param("documentId") documentId: string,
    @Param("fileId") fileId: string,
  ) {
    return this.documents.download(request.platformUser!, documentId, fileId, request.ip);
  }

  @Get(":documentId/versions")
  versions(@Req() request: AdminRequest, @Param("documentId") documentId: string) {
    return this.documents.listVersions(request.platformUser!, documentId);
  }

  @Get(":documentId/versions/:versionId")
  version(
    @Req() request: AdminRequest,
    @Param("documentId") documentId: string,
    @Param("versionId") versionId: string,
  ) {
    return this.documents.getVersion(request.platformUser!, documentId, versionId);
  }

  @Get("taxonomies/all")
  taxonomies(@Req() request: AdminRequest) {
    return this.documents.listTaxonomies(request.platformUser!);
  }

  @Post(":documentId/classifications")
  classify(
    @Req() request: AdminRequest,
    @Param("documentId") documentId: string,
    @Body() body: unknown,
  ) {
    return this.documents.updateClassification(
      request.platformUser!,
      documentId,
      parse(classificationUpdateSchema, body),
      request.ip,
    );
  }

  @Post(":documentId/versions/:versionId/metadata/:suggestionId")
  decideMetadata(
    @Req() request: AdminRequest,
    @Param("documentId") documentId: string,
    @Param("versionId") versionId: string,
    @Param("suggestionId") suggestionId: string,
    @Body() body: unknown,
  ) {
    return this.documents.decideMetadata(
      request.platformUser!,
      documentId,
      versionId,
      suggestionId,
      parse(metadataDecisionSchema, body),
      request.ip,
    );
  }

  @Post(":documentId/relationships")
  relationship(
    @Req() request: AdminRequest,
    @Param("documentId") documentId: string,
    @Body() body: unknown,
  ) {
    return this.documents.createRelationship(
      request.platformUser!,
      documentId,
      parse(relationshipSchema, body),
      request.ip,
    );
  }

  @Delete(":documentId")
  remove(@Req() request: AdminRequest, @Param("documentId") documentId: string) {
    return this.documents.deleteDraft(request.platformUser!, documentId, request.ip);
  }
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new UnprocessableEntityException({
      message: "Request validation failed",
      issues: result.error.issues,
    });
  return result.data;
}
