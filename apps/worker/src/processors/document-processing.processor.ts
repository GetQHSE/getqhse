import { Processor, WorkerHost } from "@nestjs/bullmq";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";
import type { ProcessingJobType } from "@qhse/documents";
import type { Job } from "bullmq";

type PipelinePayload = { documentId: string; versionId: string; jobIds: string[] };

@Processor("document-processing", { concurrency: 2 })
export class DocumentProcessingProcessor extends WorkerHost {
  private readonly database: DatabaseClient = createPrismaClient();
  private readonly workerVersion = process.env["DOCUMENT_WORKER_VERSION"] ?? "mock-1";

  async process(queueJob: Job<PipelinePayload>) {
    const { documentId, versionId, jobIds } = queueJob.data;
    try {
      await this.database.documentVersion.update({
        where: { id: versionId },
        data: { processingStatus: "RUNNING" },
      });
      for (const [index, jobId] of jobIds.entries()) {
        const stage = await this.database.documentProcessingJob.findFirst({
          where: { id: jobId, documentVersionId: versionId },
        });
        if (!stage || stage.status === "COMPLETED" || stage.status === "SKIPPED") continue;
        await this.database.documentProcessingJob.update({
          where: { id: stage.id },
          data: {
            status: "RUNNING",
            startedAt: new Date(),
            attemptCount: { increment: 1 },
            workerVersion: this.workerVersion,
          },
        });
        const result = await this.runStage(stage.jobType as ProcessingJobType, versionId);
        await this.database.documentProcessingJob.update({
          where: { id: stage.id },
          data: {
            status: result.skipped ? "SKIPPED" : "COMPLETED",
            completedAt: new Date(),
            ...(result.outputLocation ? { outputLocation: result.outputLocation } : {}),
            ...(result.metadata ? { outputMetadata: result.metadata } : {}),
            ...(result.quality !== undefined ? { qualityScore: result.quality } : {}),
            errorCode: null,
            errorMessage: null,
          },
        });
        await queueJob.updateProgress({
          stage: stage.jobType,
          completed: index + 1,
          total: jobIds.length,
        });
      }
      await this.database.$transaction([
        this.database.documentVersion.update({
          where: { id: versionId },
          data: {
            status: "REVIEW_REQUIRED",
            processingStatus: "COMPLETED",
            reviewStatus: "NOT_STARTED",
            processingError: null,
          },
        }),
        this.database.document.updateMany({
          where: { id: documentId, currentVersionId: null },
          data: { status: "REVIEW_REQUIRED" },
        }),
      ]);
      return { versionId, status: "review_required" };
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 2_000) : "Unknown processing error";
      const active = await this.database.documentProcessingJob.findFirst({
        where: { id: { in: jobIds }, status: "RUNNING" },
        orderBy: { startedAt: "desc" },
      });
      if (active)
        await this.database.documentProcessingJob.update({
          where: { id: active.id },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errorCode: "PROVIDER_FAILURE",
            errorMessage: message,
          },
        });
      await this.database.$transaction([
        this.database.documentVersion.update({
          where: { id: versionId },
          data: {
            status: "PROCESSING_FAILED",
            processingStatus: "FAILED",
            processingError: message,
          },
        }),
        this.database.document.updateMany({
          where: { id: documentId, currentVersionId: null },
          data: { status: "PROCESSING_FAILED" },
        }),
      ]);
      await this.database.documentActivity.create({
        data: {
          documentId,
          documentVersionId: versionId,
          action: "document.processing_failed",
          metadata: { errorCode: "PROVIDER_FAILURE" },
        },
      });
      throw error;
    }
  }

  private async runStage(
    jobType: ProcessingJobType,
    versionId: string,
  ): Promise<{
    skipped?: boolean;
    outputLocation?: string;
    metadata?: Record<string, string | boolean>;
    quality?: number;
  }> {
    const version = await this.database.documentVersion.findUniqueOrThrow({
      where: { id: versionId },
    });
    switch (jobType) {
      case "security_scan":
        return {
          metadata: {
            provider: process.env["MALWARE_SCANNER_PROVIDER"] ?? "mock",
            verdict: "clean",
          },
          quality: 1,
        };
      case "file_validation":
        return {
          metadata: { signatureValidation: "provider_pending", mimeType: version.mimeType },
          quality: 0.8,
        };
      case "text_extraction": {
        const raw = `documents/${version.documentId}/versions/${version.id}/extracted/raw.txt`;
        const normalized = `documents/${version.documentId}/versions/${version.id}/extracted/normalized.txt`;
        await this.database.documentVersion.update({
          where: { id: versionId },
          data: {
            extractionMethod: process.env["DOCUMENT_EXTRACTION_PROVIDER"] ?? "mock",
            rawExtractedTextLocation: raw,
            normalizedTextLocation: normalized,
          },
        });
        return {
          outputLocation: normalized,
          metadata: { provider: process.env["DOCUMENT_EXTRACTION_PROVIDER"] ?? "mock", mock: true },
          quality: 0.5,
        };
      }
      case "ocr": {
        const isImage = version.mimeType.startsWith("image/");
        if (!isImage) return { skipped: true, metadata: { reason: "extractable_text_assumed" } };
        await this.database.documentVersion.update({
          where: { id: versionId },
          data: { ocrUsed: true, ocrConfidence: 0.5 },
        });
        return {
          metadata: {
            provider: process.env["DOCUMENT_OCR_PROVIDER"] ?? "mock",
            reviewRequired: true,
          },
          quality: 0.5,
        };
      }
      case "metadata_detection":
        await this.database.documentMetadataSuggestion.upsert({
          where: {
            documentVersionId_fieldName: {
              documentVersionId: versionId,
              fieldName: "versionLabel",
            },
          },
          update: {},
          create: {
            documentVersionId: versionId,
            fieldName: "versionLabel",
            suggestedValue: version.versionLabel,
            confidenceScore: 1,
            sourceText: version.versionLabel,
          },
        });
        return { metadata: { provider: "rules", reviewRequired: true }, quality: 0.7 };
      case "embedding_preparation":
        return process.env["DOCUMENT_EMBEDDINGS_ENABLED"] === "true"
          ? { metadata: { configured: true } }
          : { skipped: true, metadata: { reason: "disabled" } };
      default:
        return { metadata: { provider: "mock", reviewRequired: true }, quality: 0.5 };
    }
  }
}
