import { randomUUID } from "node:crypto";

import { InjectQueue } from "@nestjs/bullmq";
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
  createPrismaClient,
  type DatabaseClient,
  type DocumentStatus as DbDocumentStatus,
  Prisma,
  ProcessingJobStatus,
} from "@qhse/database";
import {
  canManageDocuments,
  canTransition,
  checklistIsComplete,
  processingIdempotencyKey,
  processingPipeline,
  publicationChecklist,
  type CreateDocumentInput,
  type CreateReviewIssueInput,
  type CreateVersionInput,
  type DocumentAction,
  type DocumentStatus,
  type ListDocumentsInput,
  type UpdateDocumentInput,
} from "@qhse/documents";
import type { Queue } from "bullmq";

import { DocumentStorageService } from "./document-storage.service.js";

const enumValue = (value: string) => value.toUpperCase();
const apiStatus = (value: DbDocumentStatus): DocumentStatus =>
  value.toLowerCase() as DocumentStatus;
const date = (value?: string) => (value ? new Date(`${value}T00:00:00.000Z`) : undefined);
const jsonSafe = <T>(value: T): T =>
  JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as T;

@Injectable()
export class DocumentsService {
  private readonly database: DatabaseClient;

  constructor(
    @Inject(DocumentStorageService)
    private readonly storage: DocumentStorageService,
    @InjectQueue("document-processing") private readonly queue: Queue,
  ) {
    this.database = createPrismaClient();
  }

  private authorize(user: CurrentUser, action: DocumentAction) {
    if (!canManageDocuments(user.platformRole, action)) {
      throw new ForbiddenException(`Your platform role cannot ${action} documents`);
    }
  }

  private transition(from: DbDocumentStatus, to: DocumentStatus) {
    if (!canTransition(apiStatus(from), to)) {
      throw new ConflictException(`Cannot transition a ${apiStatus(from)} version to ${to}`);
    }
  }

  private async activity(input: {
    documentId: string;
    versionId?: string | undefined;
    actorId: string;
    action: string;
    ip?: string | undefined;
    metadata?: Record<string, string | number | boolean | null> | undefined;
  }) {
    await this.database.documentActivity.create({
      data: {
        documentId: input.documentId,
        actorUserId: input.actorId,
        action: input.action,
        ...(input.versionId ? { documentVersionId: input.versionId } : {}),
        ...(input.ip ? { ipAddress: input.ip } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
    });
  }

  async dashboard(user: CurrentUser) {
    this.authorize(user, "view");
    const now = new Date();
    const inNinetyDays = new Date(now.getTime() + 90 * 86_400_000);
    const [
      total,
      published,
      drafts,
      processing,
      failedJobs,
      needsReview,
      lowOcr,
      expiring,
      recentlyPublished,
    ] = await Promise.all([
      this.database.document.count({ where: { deletedAt: null } }),
      this.database.document.count({ where: { status: "PUBLISHED", deletedAt: null } }),
      this.database.document.count({ where: { status: "DRAFT", deletedAt: null } }),
      this.database.document.count({ where: { status: "PROCESSING", deletedAt: null } }),
      this.database.documentProcessingJob.count({ where: { status: "FAILED" } }),
      this.database.documentVersion.count({ where: { status: "REVIEW_REQUIRED" } }),
      this.database.documentVersion.count({
        where: { ocrUsed: true, ocrConfidence: { lt: 0.75 } },
      }),
      this.database.document.count({
        where: { expirationDate: { gte: now, lte: inNinetyDays }, deletedAt: null },
      }),
      this.database.documentVersion.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        take: 5,
        select: {
          id: true,
          versionLabel: true,
          publishedAt: true,
          document: { select: { id: true, title: true } },
        },
      }),
    ]);
    return {
      totals: { total, published, drafts, processing, failedJobs, needsReview, lowOcr, expiring },
      queues: {
        needsClassification: await this.database.document.count({
          where: { taxonomyTerms: { none: { isValidated: true } }, deletedAt: null },
        }),
        metadataReview: await this.database.documentMetadataSuggestion.count({
          where: { decision: "pending" },
        }),
        ocrReview: lowOcr,
        readyToValidate: needsReview,
        readyToPublish: await this.database.documentVersion.count({
          where: { status: "VALIDATED" },
        }),
        processingFailed: failedJobs,
      },
      recentlyPublished,
    };
  }

  async list(user: CurrentUser, input: ListDocumentsInput) {
    this.authorize(user, "view");
    const where = {
      deletedAt: null,
      ...(input.status ? { status: enumValue(input.status) as DbDocumentStatus } : {}),
      ...(input.documentType ? { documentType: input.documentType } : {}),
      ...(input.countryCode ? { countryCode: input.countryCode.toUpperCase() } : {}),
      ...(input.language ? { language: input.language } : {}),
      ...(input.issuingAuthority
        ? { issuingAuthority: { contains: input.issuingAuthority, mode: "insensitive" as const } }
        : {}),
      ...(input.search
        ? {
            OR: [
              { title: { contains: input.search, mode: "insensitive" as const } },
              { referenceNumber: { contains: input.search, mode: "insensitive" as const } },
              { issuingAuthority: { contains: input.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(input.processingStatus || input.ocrUsed !== undefined || input.hasErrors !== undefined
        ? {
            versions: {
              some: {
                ...(input.processingStatus
                  ? { processingStatus: enumValue(input.processingStatus) as ProcessingJobStatus }
                  : {}),
                ...(input.ocrUsed !== undefined ? { ocrUsed: input.ocrUsed } : {}),
                ...(input.hasErrors ? { processingError: { not: null } } : {}),
              },
            },
          }
        : {}),
    };
    const [total, records] = await Promise.all([
      this.database.document.count({ where }),
      this.database.document.findMany({
        where,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: { [input.sort]: input.direction },
        include: {
          currentVersion: {
            select: { id: true, versionLabel: true, processingStatus: true, ocrUsed: true },
          },
          updatedBy: { select: { id: true, name: true } },
          _count: { select: { versions: true } },
        },
      }),
    ]);
    return {
      data: records.map((record) => ({
        ...record,
        status: apiStatus(record.status),
        currentVersion: record.currentVersion
          ? {
              ...record.currentVersion,
              processingStatus: record.currentVersion.processingStatus.toLowerCase(),
            }
          : null,
      })),
      meta: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        pageCount: Math.ceil(total / input.pageSize),
      },
    };
  }

  async get(user: CurrentUser, documentId: string) {
    this.authorize(user, "view");
    const document = await this.database.document.findFirst({
      where: { id: documentId, deletedAt: null },
      include: {
        currentVersion: true,
        versions: {
          orderBy: { versionNumber: "desc" },
          include: {
            files: true,
            processingJobs: { orderBy: { createdAt: "asc" } },
            metadataSuggestions: true,
            reviewIssues: { orderBy: { createdAt: "desc" } },
            _count: { select: { sections: true, chunks: true } },
            createdBy: { select: { id: true, name: true } },
            validatedBy: { select: { id: true, name: true } },
            publishedBy: { select: { id: true, name: true } },
          },
        },
        taxonomyTerms: {
          include: {
            term: { include: { taxonomy: true } },
            validatedBy: { select: { id: true, name: true } },
          },
        },
        sourceRelationships: {
          include: { targetDocument: { select: { id: true, title: true, referenceNumber: true } } },
        },
        targetRelationships: {
          include: { sourceDocument: { select: { id: true, title: true, referenceNumber: true } } },
        },
        activity: {
          orderBy: { createdAt: "desc" },
          take: 100,
          include: { actor: { select: { id: true, name: true } } },
        },
      },
    });
    if (!document) throw new NotFoundException("Document not found");
    return jsonSafe(document);
  }

  async create(user: CurrentUser, input: CreateDocumentInput, ip?: string) {
    this.authorize(user, "create");
    const document = await this.database.document.create({
      data: {
        title: input.title,
        shortTitle: input.shortTitle ?? null,
        description: input.description ?? null,
        documentType: input.documentType,
        sourceType: input.sourceType,
        jurisdiction: input.jurisdiction ?? null,
        countryCode: input.countryCode ?? null,
        language: input.language,
        issuingAuthority: input.issuingAuthority ?? null,
        referenceNumber: input.referenceNumber ?? null,
        publicationDate: date(input.publicationDate) ?? null,
        effectiveDate: date(input.effectiveDate) ?? null,
        expirationDate: date(input.expirationDate) ?? null,
        visibility: enumValue(input.visibility) as
          "PLATFORM_INTERNAL" | "ORGANIZATION_AVAILABLE" | "PUBLIC_REFERENCE" | "RESTRICTED",
        createdByUserId: user.id,
        updatedByUserId: user.id,
      },
    });
    await this.activity({
      documentId: document.id,
      actorId: user.id,
      action: "document.created",
      ip,
      metadata: { documentType: input.documentType },
    });
    return document;
  }

  async update(user: CurrentUser, documentId: string, input: UpdateDocumentInput, ip?: string) {
    this.authorize(user, "edit");
    const existing = await this.database.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException("Document not found");
    const data: Prisma.DocumentUncheckedUpdateInput = {
      updatedByUserId: user.id,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.shortTitle !== undefined ? { shortTitle: input.shortTitle } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.documentType !== undefined ? { documentType: input.documentType } : {}),
      ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
      ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction } : {}),
      ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.issuingAuthority !== undefined ? { issuingAuthority: input.issuingAuthority } : {}),
      ...(input.referenceNumber !== undefined ? { referenceNumber: input.referenceNumber } : {}),
      ...(input.publicationDate !== undefined
        ? { publicationDate: new Date(`${input.publicationDate}T00:00:00.000Z`) }
        : {}),
      ...(input.effectiveDate !== undefined
        ? { effectiveDate: new Date(`${input.effectiveDate}T00:00:00.000Z`) }
        : {}),
      ...(input.expirationDate !== undefined
        ? { expirationDate: new Date(`${input.expirationDate}T00:00:00.000Z`) }
        : {}),
      ...(input.visibility !== undefined
        ? {
            visibility: enumValue(input.visibility) as
              "PLATFORM_INTERNAL" | "ORGANIZATION_AVAILABLE" | "PUBLIC_REFERENCE" | "RESTRICTED",
          }
        : {}),
    };
    const document = await this.database.document.update({ where: { id: documentId }, data });
    await this.activity({
      documentId,
      actorId: user.id,
      action: "document.metadata_updated",
      ip,
      metadata: { fields: Object.keys(input).join(",") },
    });
    return document;
  }

  async createVersion(
    user: CurrentUser,
    documentId: string,
    input: CreateVersionInput,
    ip?: string,
  ) {
    this.authorize(user, "create");
    const document = await this.database.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });
    if (!document) throw new NotFoundException("Document not found");
    if (document.status === "ARCHIVED")
      throw new ConflictException("Archived documents cannot receive new versions");

    const resumable = await this.database.documentVersion.findFirst({
      where: {
        documentId,
        versionLabel: input.versionLabel,
        fileHash: input.fileHash,
        status: "UPLOADED",
        files: { none: { fileRole: "primary" } },
      },
    });
    if (resumable) return jsonSafe(resumable);

    const duplicate = await this.database.documentVersion.findFirst({
      where: {
        fileHash: input.fileHash,
        files: { some: { fileRole: "primary" } },
      },
      include: { document: { select: { id: true, title: true } } },
    });
    if (duplicate && !input.allowDuplicate)
      throw new ConflictException({
        message: "Duplicate file detected",
        duplicate: {
          documentId: duplicate.document.id,
          title: duplicate.document.title,
          versionId: duplicate.id,
          versionLabel: duplicate.versionLabel,
          uploadedAt: duplicate.createdAt,
          status: apiStatus(duplicate.status),
        },
      });
    if (
      duplicate &&
      input.allowDuplicate &&
      !canManageDocuments(user.platformRole, "override_duplicate")
    )
      throw new ForbiddenException(
        "Only an authorized administrator may override duplicate detection",
      );
    const latest = await this.database.documentVersion.aggregate({
      where: { documentId },
      _max: { versionNumber: true },
    });
    const versionId = randomUUID();
    const version = await this.database.documentVersion.create({
      data: {
        id: versionId,
        documentId,
        versionNumber: (latest._max.versionNumber ?? 0) + 1,
        versionLabel: input.versionLabel,
        revisionDate: date(input.revisionDate) ?? null,
        effectiveDate: date(input.effectiveDate) ?? null,
        expirationDate: date(input.expirationDate) ?? null,
        changeSummary: input.changeSummary ?? null,
        changeType: enumValue(input.changeType) as
          | "INITIAL"
          | "MINOR_REVISION"
          | "MAJOR_REVISION"
          | "AMENDMENT"
          | "CORRECTION"
          | "REPLACEMENT"
          | "TRANSLATION",
        originalFileName: input.originalFileName,
        mimeType: input.mimeType,
        fileExtension: input.originalFileName.split(".").at(-1)?.toLowerCase() ?? "bin",
        fileSize: BigInt(input.fileSize),
        storageKey: `pending/${versionId}`,
        fileHash: input.fileHash,
        supersedesVersionId: input.supersedesVersionId ?? null,
        createdByUserId: user.id,
      },
    });
    await this.database.document.updateMany({
      where: { id: documentId, currentVersionId: null },
      data: { status: "UPLOADED", updatedByUserId: user.id },
    });
    await this.activity({
      documentId,
      versionId,
      actorId: user.id,
      action: "document.upload_started",
      ip,
      metadata: { versionLabel: input.versionLabel, duplicateOverride: Boolean(duplicate) },
    });
    return jsonSafe(version);
  }

  async requestUpload(
    user: CurrentUser,
    documentId: string,
    versionId: string,
    input: { fileName: string; mimeType: string; fileSize: number; checksum: string },
    ip?: string,
  ) {
    this.authorize(user, "create");
    const version = await this.findVersion(documentId, versionId);
    if (version.status !== "UPLOADED")
      throw new ConflictException("Upload URLs are only available for unpublished uploads");
    const confirmedFile = await this.database.documentFile.findFirst({
      where: { documentVersionId: versionId, fileRole: "primary" },
      select: { id: true },
    });
    if (confirmedFile)
      throw new ConflictException("The immutable primary file is already confirmed");
    if (
      version.fileHash !== input.checksum ||
      Number(version.fileSize) !== input.fileSize ||
      version.mimeType !== input.mimeType
    )
      throw new UnprocessableEntityException(
        "Upload metadata must match the immutable version record",
      );
    const fileId = randomUUID();
    const signed = await this.storage.createUploadUrl({
      documentId,
      versionId,
      fileId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.fileSize,
      checksum: input.checksum,
    });
    await this.database.documentVersion.update({
      where: { id: versionId },
      data: { storageKey: signed.storageKey },
    });
    await this.activity({
      documentId,
      versionId,
      actorId: user.id,
      action: "document.upload_started",
      ip,
    });
    return { ...signed, fileId };
  }

  async confirmUpload(user: CurrentUser, documentId: string, versionId: string, ip?: string) {
    this.authorize(user, "create");
    const version = await this.findVersion(documentId, versionId);
    if (version.status !== "UPLOADED")
      throw new ConflictException("Only unpublished uploads can be confirmed");
    if (version.storageKey.startsWith("pending/"))
      throw new ConflictException("An upload URL has not been requested");
    await this.storage.verifyObject(version.storageKey, {
      sizeBytes: Number(version.fileSize),
      checksum: version.fileHash,
    });
    await this.database.documentFile.upsert({
      where: {
        documentVersionId_fileHash_fileRole: {
          documentVersionId: versionId,
          fileHash: version.fileHash,
          fileRole: "primary",
        },
      },
      update: {},
      create: {
        documentVersionId: versionId,
        fileRole: "primary",
        originalFileName: version.originalFileName,
        storageKey: version.storageKey,
        mimeType: version.mimeType,
        fileExtension: version.fileExtension,
        fileSize: version.fileSize,
        fileHash: version.fileHash,
        uploadedByUserId: user.id,
      },
    });
    await this.activity({
      documentId,
      versionId,
      actorId: user.id,
      action: "document.upload_completed",
      ip,
    });
    return { confirmed: true, versionId };
  }

  async startProcessing(
    user: CurrentUser,
    documentId: string,
    versionId: string,
    input: { fromJob?: string | undefined; force: boolean },
    ip?: string,
  ) {
    this.authorize(user, "process");
    const version = await this.findVersion(documentId, versionId);
    this.transition(version.status, "processing");
    const primaryFile = await this.database.documentFile.findFirst({
      where: { documentVersionId: versionId, fileRole: "primary" },
      select: { id: true },
    });
    if (!primaryFile) throw new UnprocessableEntityException("Confirm the primary upload first");
    const startIndex = input.fromJob
      ? processingPipeline.indexOf(input.fromJob as (typeof processingPipeline)[number])
      : 0;
    if (startIndex < 0) throw new UnprocessableEntityException("Unknown processing stage");
    const generation = input.force ? Date.now() : 1;
    const stages = processingPipeline.slice(startIndex);
    const jobs = await this.database.$transaction(
      stages.map((jobType) =>
        this.database.documentProcessingJob.upsert({
          where: { idempotencyKey: processingIdempotencyKey(versionId, jobType, generation) },
          update: input.force
            ? { status: "PENDING", errorCode: null, errorMessage: null, completedAt: null }
            : {},
          create: {
            documentVersionId: versionId,
            jobType,
            idempotencyKey: processingIdempotencyKey(versionId, jobType, generation),
            inputMetadata: { storageKey: version.storageKey },
          },
        }),
      ),
    );
    await this.database.$transaction([
      this.database.documentVersion.update({
        where: { id: versionId },
        data: { status: "PROCESSING", processingStatus: "PENDING", processingError: null },
      }),
      this.database.document.updateMany({
        where: { id: documentId, currentVersionId: null },
        data: { status: "PROCESSING", updatedByUserId: user.id },
      }),
    ]);
    await this.queue.add(
      "process-version",
      { documentId, versionId, jobIds: jobs.map(({ id }) => id) },
      {
        jobId: `document:${versionId}:${generation}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 2_000 },
      },
    );
    await this.activity({
      documentId,
      versionId,
      actorId: user.id,
      action: "document.processing_started",
      ip,
      metadata: { stageCount: jobs.length },
    });
    return { versionId, jobs };
  }

  async retryJob(
    user: CurrentUser,
    documentId: string,
    versionId: string,
    jobId: string,
    ip?: string,
  ) {
    this.authorize(user, "process");
    const job = await this.database.documentProcessingJob.findFirst({
      where: { id: jobId, documentVersionId: versionId, version: { documentId } },
    });
    if (!job) throw new NotFoundException("Processing job not found");
    if (job.status !== "FAILED")
      throw new ConflictException("Only failed processing jobs can be retried");
    await this.database.documentProcessingJob.update({
      where: { id: jobId },
      data: { status: "PENDING", errorCode: null, errorMessage: null, completedAt: null },
    });
    await this.queue.add(
      "retry-stage",
      { documentId, versionId, jobIds: [jobId] },
      { jobId: `retry:${jobId}:${job.attemptCount + 1}` },
    );
    await this.activity({
      documentId,
      versionId,
      actorId: user.id,
      action: "document.processing_retried",
      ip,
      metadata: { jobId },
    });
    return { retried: true, jobId };
  }

  async createIssue(
    user: CurrentUser,
    documentId: string,
    versionId: string,
    input: CreateReviewIssueInput,
    ip?: string,
  ) {
    this.authorize(user, "review");
    await this.findVersion(documentId, versionId);
    const issue = await this.database.documentReviewIssue.create({
      data: {
        documentVersionId: versionId,
        processingJobId: input.processingJobId ?? null,
        issueType: input.issueType,
        severity: enumValue(input.severity) as "LOW" | "MEDIUM" | "HIGH" | "BLOCKING",
        title: input.title,
        description: input.description,
        ...(input.sourceLocation
          ? { sourceLocation: input.sourceLocation as Prisma.InputJsonValue }
          : {}),
        assignedToUserId: input.assignedToUserId ?? null,
        createdByUserId: user.id,
      },
    });
    await this.activity({
      documentId,
      versionId,
      actorId: user.id,
      action: "document.review_issue_created",
      ip,
      metadata: { issueId: issue.id, severity: input.severity },
    });
    return issue;
  }

  async resolveIssue(
    user: CurrentUser,
    documentId: string,
    versionId: string,
    issueId: string,
    ip?: string,
  ) {
    this.authorize(user, "review");
    const issue = await this.database.documentReviewIssue.findFirst({
      where: { id: issueId, documentVersionId: versionId, version: { documentId } },
    });
    if (!issue) throw new NotFoundException("Review issue not found");
    if (issue.status !== "OPEN") throw new ConflictException("Review issue is already closed");
    const resolved = await this.database.documentReviewIssue.update({
      where: { id: issueId },
      data: { status: "RESOLVED", resolvedByUserId: user.id, resolvedAt: new Date() },
    });
    await this.activity({
      documentId,
      versionId,
      actorId: user.id,
      action: "document.review_issue_resolved",
      ip,
      metadata: { issueId },
    });
    return resolved;
  }

  async validateVersion(
    user: CurrentUser,
    documentId: string,
    versionId: string,
    relationshipConfirmed: boolean,
    ip?: string,
  ) {
    this.authorize(user, "validate");
    const version = await this.database.documentVersion.findFirst({
      where: { id: versionId, documentId },
      include: {
        files: true,
        sections: { take: 1 },
        metadataSuggestions: { where: { decision: "pending" }, take: 1 },
        reviewIssues: { where: { status: "OPEN", severity: "BLOCKING" } },
        processingJobs: true,
        document: { include: { taxonomyTerms: { where: { isValidated: true }, take: 1 } } },
      },
    });
    if (!version) throw new NotFoundException("Document version not found");
    this.transition(version.status, "validated");
    const extraction = version.processingJobs.find(({ jobType }) => jobType === "text_extraction");
    const securityScan = version.processingJobs.find(({ jobType }) => jobType === "security_scan");
    const fileValidation = version.processingJobs.find(
      ({ jobType }) => jobType === "file_validation",
    );
    const ocr = version.processingJobs.find(({ jobType }) => jobType === "ocr");
    const checklist = publicationChecklist({
      metadataValidated: version.metadataSuggestions.length === 0,
      filesVerified:
        version.files.length > 0 &&
        securityScan?.status === "COMPLETED" &&
        fileValidation?.status === "COMPLETED",
      extractionCompleted: extraction?.status === "COMPLETED",
      ocrRequired: ocr?.status !== "SKIPPED",
      ocrReviewed: !version.ocrUsed || (version.ocrConfidence?.toNumber() ?? 0) >= 0.75,
      structureValidated: version.sections.length > 0,
      classificationApproved: version.document.taxonomyTerms.length > 0,
      relationshipConfirmed,
      blockingIssueCount: version.reviewIssues.length,
    });
    if (!checklistIsComplete(checklist))
      throw new UnprocessableEntityException({
        message: "Publication checklist is incomplete",
        checklist,
      });
    const validated = await this.database.$transaction(async (tx) => {
      const result = await tx.documentVersion.update({
        where: { id: versionId },
        data: {
          status: "VALIDATED",
          reviewStatus: "APPROVED",
          validatedByUserId: user.id,
          validatedAt: new Date(),
        },
      });
      await tx.document.updateMany({
        where: { id: documentId, currentVersionId: null },
        data: { status: "VALIDATED", updatedByUserId: user.id },
      });
      return result;
    });
    await this.activity({
      documentId,
      versionId,
      actorId: user.id,
      action: "document.version_validated",
      ip,
    });
    return jsonSafe({ version: validated, checklist });
  }

  async publishVersion(
    user: CurrentUser,
    documentId: string,
    versionId: string,
    confirmed: boolean,
    ip?: string,
  ) {
    this.authorize(user, "publish");
    if (!confirmed)
      throw new UnprocessableEntityException("Explicit publication confirmation is required");
    const version = await this.findVersion(documentId, versionId);
    this.transition(version.status, "published");
    const now = new Date();
    const published = await this.database.$transaction(async (tx) => {
      const result = await tx.documentVersion.update({
        where: { id: versionId },
        data: { status: "PUBLISHED", publishedByUserId: user.id, publishedAt: now },
      });
      await tx.document.update({
        where: { id: documentId },
        data: {
          status: "PUBLISHED",
          currentVersionId: versionId,
          publishedByUserId: user.id,
          publishedAt: now,
          updatedByUserId: user.id,
        },
      });
      return result;
    });
    await this.activity({
      documentId,
      versionId,
      actorId: user.id,
      action: "document.version_published",
      ip,
    });
    return jsonSafe(published);
  }

  async archive(user: CurrentUser, documentId: string, ip?: string) {
    this.authorize(user, "archive");
    const document = await this.database.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });
    if (!document) throw new NotFoundException("Document not found");
    this.transition(document.status, "archived");
    const archived = await this.database.document.update({
      where: { id: documentId },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        currentVersionId: null,
        updatedByUserId: user.id,
      },
    });
    await this.activity({ documentId, actorId: user.id, action: "document.archived", ip });
    return archived;
  }

  async compare(user: CurrentUser, documentId: string, versionId: string, otherVersionId: string) {
    this.authorize(user, "view");
    const versions = await this.database.documentVersion.findMany({
      where: { documentId, id: { in: [versionId, otherVersionId] } },
      include: {
        chunks: { orderBy: { chunkIndex: "asc" } },
        sections: { orderBy: { orderIndex: "asc" } },
        sourceRelationships: true,
      },
    });
    if (versions.length !== 2)
      throw new NotFoundException("One or both document versions were not found");
    const before = versions.find(({ id }) => id === versionId)!;
    const after = versions.find(({ id }) => id === otherVersionId)!;
    const beforeParagraphs = before.chunks.map(({ content }) => content);
    const afterParagraphs = after.chunks.map(({ content }) => content);
    const beforeSet = new Set(beforeParagraphs);
    const afterSet = new Set(afterParagraphs);
    return {
      versions: {
        before: { id: before.id, label: before.versionLabel },
        after: { id: after.id, label: after.versionLabel },
      },
      metadata: ["versionLabel", "revisionDate", "effectiveDate", "expirationDate", "changeType"]
        .map((field) => ({
          field,
          before: before[field as keyof typeof before],
          after: after[field as keyof typeof after],
        }))
        .filter(({ before: a, after: b }) => JSON.stringify(a) !== JSON.stringify(b)),
      content: {
        added: afterParagraphs.filter((item) => !beforeSet.has(item)),
        removed: beforeParagraphs.filter((item) => !afterSet.has(item)),
      },
      structure: {
        before: before.sections.map(({ sectionType, sectionNumber, title }) => ({
          sectionType,
          sectionNumber,
          title,
        })),
        after: after.sections.map(({ sectionType, sectionNumber, title }) => ({
          sectionType,
          sectionNumber,
          title,
        })),
      },
      references: { before: before.sourceRelationships, after: after.sourceRelationships },
    };
  }

  async download(user: CurrentUser, documentId: string, fileId: string, ip?: string) {
    this.authorize(user, "view");
    const file = await this.database.documentFile.findFirst({
      where: { id: fileId, version: { documentId } },
    });
    if (!file) throw new NotFoundException("Document file not found");
    const url = await this.storage.createDownloadUrl(file.storageKey);
    await this.activity({
      documentId,
      versionId: file.documentVersionId,
      actorId: user.id,
      action: "document.downloaded",
      ip,
      metadata: { fileId },
    });
    return { url, expiresInSeconds: 300 };
  }

  async listVersions(user: CurrentUser, documentId: string) {
    this.authorize(user, "view");
    const document = await this.database.document.findFirst({
      where: { id: documentId, deletedAt: null },
      select: { id: true },
    });
    if (!document) throw new NotFoundException("Document not found");
    return jsonSafe(
      await this.database.documentVersion.findMany({
        where: { documentId },
        orderBy: { versionNumber: "desc" },
        include: {
          files: true,
          processingJobs: true,
          _count: { select: { sections: true, chunks: true, reviewIssues: true } },
        },
      }),
    );
  }

  async getVersion(user: CurrentUser, documentId: string, versionId: string) {
    this.authorize(user, "view");
    const version = await this.database.documentVersion.findFirst({
      where: { id: versionId, documentId },
      include: {
        files: true,
        processingJobs: { orderBy: { createdAt: "asc" } },
        sections: { orderBy: { orderIndex: "asc" } },
        chunks: { orderBy: { chunkIndex: "asc" } },
        metadataSuggestions: true,
        reviews: true,
        reviewIssues: true,
        sourceRelationships: true,
        targetRelationships: true,
      },
    });
    if (!version) throw new NotFoundException("Document version not found");
    return jsonSafe(version);
  }

  async listTaxonomies(user: CurrentUser) {
    this.authorize(user, "view");
    return this.database.taxonomy.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        terms: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
      },
    });
  }

  async updateClassification(
    user: CurrentUser,
    documentId: string,
    input: {
      taxonomyTermIds: string[];
      source: "automatic" | "manual";
      confidenceScore?: number | undefined;
      validated: boolean;
    },
    ip?: string,
  ) {
    this.authorize(user, "review");
    const document = await this.database.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });
    if (!document) throw new NotFoundException("Document not found");
    if (input.source === "automatic" && input.validated)
      throw new UnprocessableEntityException(
        "Automatic classifications must be explicitly converted to a manual validation",
      );
    const terms = await this.database.taxonomyTerm.findMany({
      where: { id: { in: input.taxonomyTermIds }, isActive: true },
      select: { id: true },
    });
    if (terms.length !== input.taxonomyTermIds.length)
      throw new UnprocessableEntityException("One or more taxonomy terms are invalid");
    const records = await this.database.$transaction(
      terms.map(({ id }) =>
        this.database.documentTaxonomyTerm.upsert({
          where: {
            documentId_taxonomyTermId_source: {
              documentId,
              taxonomyTermId: id,
              source: input.source,
            },
          },
          update: {
            ...(input.confidenceScore !== undefined
              ? { confidenceScore: input.confidenceScore }
              : {}),
            isValidated: input.validated,
            validatedByUserId: input.validated ? user.id : null,
            validatedAt: input.validated ? new Date() : null,
          },
          create: {
            documentId,
            taxonomyTermId: id,
            source: input.source,
            ...(input.confidenceScore !== undefined
              ? { confidenceScore: input.confidenceScore }
              : {}),
            isValidated: input.validated,
            ...(input.validated ? { validatedByUserId: user.id, validatedAt: new Date() } : {}),
          },
        }),
      ),
    );
    await this.activity({
      documentId,
      actorId: user.id,
      action: "document.classification_updated",
      ip,
      metadata: { source: input.source, validated: input.validated, termCount: terms.length },
    });
    return records;
  }

  async decideMetadata(
    user: CurrentUser,
    documentId: string,
    versionId: string,
    suggestionId: string,
    input: { decision: "accepted" | "rejected" | "edited"; value?: unknown },
    ip?: string,
  ) {
    this.authorize(user, "review");
    const suggestion = await this.database.documentMetadataSuggestion.findFirst({
      where: { id: suggestionId, documentVersionId: versionId, version: { documentId } },
      include: { version: { select: { status: true } } },
    });
    if (!suggestion) throw new NotFoundException("Metadata suggestion not found");
    if (suggestion.decision !== "pending")
      throw new ConflictException("Metadata suggestion has already been reviewed");
    if (input.decision === "edited" && input.value === undefined)
      throw new UnprocessableEntityException("An edited value is required");
    const proposedValue = input.decision === "edited" ? input.value : suggestion.suggestedValue;
    if (input.decision !== "rejected" && typeof proposedValue === "string") {
      if (suggestion.fieldName === "versionLabel") {
        if (["VALIDATED", "PUBLISHED", "ARCHIVED"].includes(suggestion.version.status))
          throw new ConflictException("Published or validated version metadata is immutable");
        await this.database.documentVersion.update({
          where: { id: versionId },
          data: { versionLabel: proposedValue },
        });
      } else {
        const documentFields = new Set([
          "title",
          "shortTitle",
          "description",
          "documentType",
          "sourceType",
          "jurisdiction",
          "countryCode",
          "language",
          "issuingAuthority",
          "referenceNumber",
        ]);
        if (documentFields.has(suggestion.fieldName)) {
          await this.database.document.update({
            where: { id: documentId },
            data: {
              [suggestion.fieldName]: proposedValue,
              updatedByUserId: user.id,
            },
          });
        }
      }
    }
    const reviewed = await this.database.documentMetadataSuggestion.update({
      where: { id: suggestionId },
      data: {
        decision: input.decision,
        ...(input.decision === "edited"
          ? { suggestedValue: input.value as Prisma.InputJsonValue }
          : {}),
        reviewedByUserId: user.id,
        reviewedAt: new Date(),
      },
    });
    await this.activity({
      documentId,
      versionId,
      actorId: user.id,
      action: "document.metadata_updated",
      ip,
      metadata: { field: suggestion.fieldName, decision: input.decision },
    });
    return reviewed;
  }

  async createRelationship(
    user: CurrentUser,
    documentId: string,
    input: {
      targetDocumentId: string;
      sourceVersionId?: string | undefined;
      targetVersionId?: string | undefined;
      relationshipType: string;
      description?: string | undefined;
    },
    ip?: string,
  ) {
    this.authorize(user, "edit");
    if (documentId === input.targetDocumentId)
      throw new UnprocessableEntityException("A document cannot relate to itself");
    const count = await this.database.document.count({
      where: { id: { in: [documentId, input.targetDocumentId] }, deletedAt: null },
    });
    if (count !== 2) throw new NotFoundException("Source or target document not found");
    const relationship = await this.database.documentRelationship.create({
      data: {
        sourceDocumentId: documentId,
        sourceVersionId: input.sourceVersionId ?? null,
        targetDocumentId: input.targetDocumentId,
        targetVersionId: input.targetVersionId ?? null,
        relationshipType: input.relationshipType,
        description: input.description ?? null,
        createdByUserId: user.id,
      },
    });
    await this.activity({
      documentId,
      versionId: input.sourceVersionId,
      actorId: user.id,
      action:
        input.relationshipType === "supersedes"
          ? "document.version_superseded"
          : "document.metadata_updated",
      ip,
      metadata: {
        relationshipType: input.relationshipType,
        targetDocumentId: input.targetDocumentId,
      },
    });
    return relationship;
  }

  async deleteDraft(user: CurrentUser, documentId: string, ip?: string) {
    this.authorize(user, "delete");
    const document = await this.database.document.findFirst({
      where: { id: documentId, deletedAt: null },
      include: {
        _count: { select: { sourceRelationships: true, targetRelationships: true } },
        versions: { select: { status: true } },
      },
    });
    if (!document) throw new NotFoundException("Document not found");
    if (
      document.status !== "DRAFT" ||
      document.versions.some(({ status }) => ["VALIDATED", "PUBLISHED"].includes(status)) ||
      document._count.sourceRelationships + document._count.targetRelationships > 0
    )
      throw new ConflictException(
        "Only dependency-free drafts may be deleted; archive this document instead",
      );
    await this.activity({ documentId, actorId: user.id, action: "document.deleted", ip });
    await this.database.document.update({
      where: { id: documentId },
      data: { deletedAt: new Date(), updatedByUserId: user.id },
    });
    return { deleted: true };
  }

  private async findVersion(documentId: string, versionId: string) {
    const version = await this.database.documentVersion.findFirst({
      where: { id: versionId, documentId, document: { deletedAt: null } },
    });
    if (!version) throw new NotFoundException("Document version not found");
    return version;
  }
}
