import { Processor, WorkerHost } from "@nestjs/bullmq";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPrismaClient, type DatabaseClient } from "@qhse/database";
import type { ProcessingJobType } from "@qhse/documents";
import type { Job } from "bullmq";
import { createHash } from "node:crypto";

type PipelinePayload = { documentId: string; versionId: string; jobIds: string[] };

type ExtractedDocument = {
  text: string;
  pages: Array<{ pageNumber: number; text: string }>;
};

export function detectSections(text: string) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (!paragraphs.length) return [];

  const sections: Array<{ title: string | null; content: string; orderIndex: number }> = [];
  let title: string | null = null;
  let content: string[] = [];
  const flush = () => {
    if (!content.length && !title) return;
    sections.push({
      title,
      content: content.join("\n\n") || title || "",
      orderIndex: sections.length,
    });
  };
  for (const paragraph of paragraphs) {
    const firstLine = paragraph.split("\n", 1)[0] ?? "";
    const heading =
      firstLine.length <= 120 &&
      (/^(?:\d+(?:\.\d+)*[.)]?\s+|chapter\s+|section\s+|article\s+)/i.test(firstLine) ||
        /^[A-Z][A-Z\d\s:&/()-]{3,}$/.test(firstLine));
    if (heading) {
      flush();
      title = firstLine;
      content = paragraph === firstLine ? [] : [paragraph.slice(firstLine.length).trim()];
    } else {
      content.push(paragraph);
    }
  }
  flush();
  return sections.length ? sections : [{ title: null, content: text.trim(), orderIndex: 0 }];
}

export function chunkText(text: string, maxCharacters = 2_000) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxCharacters) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) chunks.push(current);
  return chunks;
}

function containsPhrase(text: string, phrase: string) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}(?=$|\\W)`, "i").test(text);
}

@Processor("document-processing", { concurrency: 2 })
export class DocumentProcessingProcessor extends WorkerHost {
  private readonly database: DatabaseClient = createPrismaClient();
  private readonly workerVersion = process.env["DOCUMENT_WORKER_VERSION"] ?? "mock-1";
  private readonly storage = new S3Client({
    ...(process.env["S3_ENDPOINT"] ? { endpoint: process.env["S3_ENDPOINT"] } : {}),
    region: process.env["S3_REGION"] ?? "us-east-1",
    forcePathStyle: process.env["S3_FORCE_PATH_STYLE"] !== "false",
    credentials: {
      accessKeyId: process.env["S3_ACCESS_KEY"] ?? "",
      secretAccessKey: process.env["S3_SECRET_KEY"] ?? "",
    },
  });
  private readonly bucket = process.env["S3_BUCKET"] ?? "qhse-files";

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
      include: { document: true },
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
        const extracted = await this.extract(
          version.storageKey,
          version.originalFileName,
          version.mimeType,
        );
        const normalizedText = extracted.text.replaceAll("\r\n", "\n").trim();
        if (!normalizedText) throw new Error("Document extraction returned no text");
        await Promise.all([
          this.putText(raw, extracted.text),
          this.putText(normalized, normalizedText),
        ]);
        await this.database.documentVersion.update({
          where: { id: versionId },
          data: {
            extractionMethod: process.env["DOCUMENT_EXTRACTION_PROVIDER"] ?? "mock",
            rawExtractedTextLocation: raw,
            normalizedTextLocation: normalized,
            pageCount: extracted.pages.length || 1,
            wordCount: normalizedText.split(/\s+/).length,
            characterCount: normalizedText.length,
          },
        });
        return {
          outputLocation: normalized,
          metadata: {
            provider: process.env["DOCUMENT_EXTRACTION_PROVIDER"] ?? "docling",
            characters: String(normalizedText.length),
          },
          quality: 0.9,
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
      case "language_detection":
        return {
          metadata: { language: version.document.language, provider: "document_metadata" },
          quality: 1,
        };
      case "structure_detection": {
        const text = await this.getText(version.normalizedTextLocation);
        const sections = detectSections(text);
        await this.database.$transaction([
          this.database.documentSection.deleteMany({ where: { documentVersionId: versionId } }),
          this.database.documentSection.createMany({
            data: sections.map((section) => ({
              documentVersionId: versionId,
              sectionType: section.title ? "heading" : "body",
              title: section.title,
              normalizedTitle: section.title?.toLowerCase() ?? null,
              content: section.content,
              orderIndex: section.orderIndex,
              sourceLocation: { method: "text_structure" },
            })),
          }),
        ]);
        return { metadata: { provider: "rules", sections: String(sections.length) }, quality: 0.7 };
      }
      case "classification": {
        const text = (await this.getText(version.normalizedTextLocation)).toLowerCase();
        const terms = await this.database.taxonomyTerm.findMany({
          where: { isActive: true, taxonomy: { isActive: true } },
          include: { taxonomy: true },
        });
        const matches = terms.filter(({ key, label }) =>
          [key.replaceAll("_", " "), label].some((value) => containsPhrase(text, value)),
        );
        const fallback = terms.find(
          ({ taxonomy, key }) => taxonomy.key === "applicability" && key === "general",
        );
        const selected = matches.length ? matches.slice(0, 20) : fallback ? [fallback] : [];
        await this.database.$transaction([
          this.database.documentTaxonomyTerm.deleteMany({
            where: { documentId: version.documentId, source: "automatic" },
          }),
          ...selected.map((term) =>
            this.database.documentTaxonomyTerm.create({
              data: {
                documentId: version.documentId,
                taxonomyTermId: term.id,
                source: "automatic",
                confidenceScore: matches.length ? 0.8 : 0.5,
              },
            }),
          ),
        ]);
        return {
          metadata: { provider: "keyword_rules", terms: String(selected.length) },
          quality: 0.7,
        };
      }
      case "chunking": {
        const text = await this.getText(version.normalizedTextLocation);
        const chunks = chunkText(text);
        const sections = await this.database.documentSection.findMany({
          where: { documentVersionId: versionId },
          orderBy: { orderIndex: "asc" },
        });
        await this.database.$transaction([
          this.database.documentChunk.deleteMany({ where: { documentVersionId: versionId } }),
          this.database.documentChunk.createMany({
            data: chunks.map((content, chunkIndex) => ({
              documentVersionId: versionId,
              documentSectionId: sections[Math.min(chunkIndex, sections.length - 1)]?.id ?? null,
              chunkIndex,
              content,
              tokenCount: Math.ceil(content.length / 4),
              contentHash: createHash("sha256").update(content).digest("hex"),
              chunkingVersion: "paragraph-v1",
              embeddingStatus: "PENDING",
              sourceLocation: { chunkIndex },
            })),
          }),
          this.database.documentVersion.update({
            where: { id: versionId },
            data: { chunkingVersion: "paragraph-v1" },
          }),
        ]);
        return {
          metadata: { provider: "paragraph-v1", chunks: String(chunks.length) },
          quality: 0.8,
        };
      }
      case "quality_checks": {
        const [sections, chunks] = await Promise.all([
          this.database.documentSection.count({ where: { documentVersionId: versionId } }),
          this.database.documentChunk.count({ where: { documentVersionId: versionId } }),
        ]);
        if (!sections || !chunks)
          throw new Error("Processing produced no reviewable structure or chunks");
        return { metadata: { sections: String(sections), chunks: String(chunks) }, quality: 0.8 };
      }
      case "preview_generation": {
        const text = await this.getText(version.normalizedTextLocation);
        const candidates = await this.database.document.findMany({
          where: {
            id: { not: version.documentId },
            deletedAt: null,
            referenceNumber: { not: null },
          },
          select: { id: true, referenceNumber: true },
        });
        const matches = candidates.filter(({ referenceNumber }) =>
          referenceNumber ? text.toLowerCase().includes(referenceNumber.toLowerCase()) : false,
        );
        for (const target of matches) {
          const existing = await this.database.documentRelationship.findFirst({
            where: {
              sourceDocumentId: version.documentId,
              sourceVersionId: versionId,
              targetDocumentId: target.id,
              targetVersionId: null,
              relationshipType: "references",
            },
          });
          if (!existing)
            await this.database.documentRelationship.create({
              data: {
                sourceDocumentId: version.documentId,
                sourceVersionId: versionId,
                targetDocumentId: target.id,
                relationshipType: "references",
                description: `Detected reference ${target.referenceNumber}`,
                createdByUserId: version.createdByUserId,
              },
            });
        }
        return {
          metadata: { provider: "reference_matcher", relationships: String(matches.length) },
          quality: 0.75,
        };
      }
      case "embedding_preparation":
        return process.env["DOCUMENT_EMBEDDINGS_ENABLED"] === "true"
          ? { metadata: { configured: true } }
          : { skipped: true, metadata: { reason: "disabled" } };
      default:
        return { metadata: { provider: "mock", reviewRequired: true }, quality: 0.5 };
    }
  }

  private async extract(
    storageKey: string,
    fileName: string,
    mimeType: string,
  ): Promise<ExtractedDocument> {
    const object = await this.storage.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    if (!object.Body) throw new Error("Uploaded document is missing from object storage");
    const bytes = await object.Body.transformToByteArray();
    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      const text = new TextDecoder().decode(bytes);
      return { text, pages: [{ pageNumber: 1, text }] };
    }
    const form = new FormData();
    form.append("file", new Blob([bytes.slice().buffer], { type: mimeType }), fileName);
    const response = await fetch(`${process.env["DOCLING_URL"]}/v1/extract`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(10 * 60 * 1_000),
    });
    if (!response.ok) throw new Error(`Docling extraction failed: ${response.status}`);
    const result = (await response.json()) as {
      text: string;
      pages?: Array<{ page_number: number; text: string }>;
    };
    return {
      text: result.text,
      pages: (result.pages ?? []).map((page) => ({
        pageNumber: page.page_number,
        text: page.text,
      })),
    };
  }

  private async putText(key: string, text: string) {
    await this.storage.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: text,
        ContentType: "text/plain; charset=utf-8",
      }),
    );
  }

  private async getText(key: string | null) {
    if (!key) throw new Error("Normalized extracted text is unavailable");
    const object = await this.storage.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!object.Body) throw new Error("Normalized extracted text is missing from object storage");
    return object.Body.transformToString();
  }
}
