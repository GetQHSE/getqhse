import { Processor, WorkerHost } from "@nestjs/bullmq";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { llmSettings } from "@qhse/ai";
import { createPrismaClient, type DatabaseClient, type Prisma } from "@qhse/database";
import { shouldRunOcr, type ProcessingJobType } from "@qhse/documents";
import {
  assertRevisionRight,
  assessStructureQuality,
  chunkNormativeProvisions,
  detectNormativeProvisions,
  detectNormativeProvisionsFromBlocks,
  normalizeExtractedText,
  STRUCTURE_REVIEW_THRESHOLD,
  type ExtractedBlock,
  type ExtractedPage,
  type NormativeLanguage,
  type ProvisionType,
  type RevisionRights,
} from "@qhse/knowledge";
import { createLogger, currentTraceId } from "@qhse/observability";
import type { Job } from "bullmq";

type PipelinePayload = { documentId: string; versionId: string; jobIds: string[] };

type ExtractedDocument = {
  text: string;
  pages: Array<{ pageNumber: number; text: string }>;
  blocks: Array<{
    blockType: string;
    text: string;
    pageNumber: number;
    boundingBox?: number[];
    headingLevel?: number;
  }>;
  provider: ExtractionProvider;
  metadata: Record<string, string>;
};

// The extractor falls back to pdftotext -- with or without a per-page OCR pass -- whenever
// Docling itself raises. That fallback produces no layout labels, so structure detection drops
// to line scanning and the provisions it finds are markedly worse. The stage used to record
// "docling" either way, which left no way to ask which revisions had silently degraded.
const extractionProviders = [
  "docling",
  "docling+full_page_ocr",
  "native_text",
  "pdftotext",
  "pdftotext+ocr",
] as const;
type ExtractionProvider = (typeof extractionProviders)[number];

function extractionProvider(reported: string | undefined): ExtractionProvider {
  return extractionProviders.find((provider) => provider === reported) ?? "docling";
}

/**
 * Scores how much of the extractor's output is worth trusting.
 *
 * The two ways an extraction goes wrong are not equally visible. Falling back to flat text is
 * merely worse -- the words are right, the layout labels are gone. A text layer that decoded to
 * nothing usable is worse than that and looks fine from the outside: it yields plenty of
 * characters, so every count-based check downstream passes and the garbage reaches a reviewer
 * looking like an ordinary document. It scores lowest so the difference is visible without
 * reading the provisions.
 */
export function extractionQuality(
  provider: ExtractionProvider,
  metadata: Record<string, string>,
): number {
  if (metadata["text_layer_degenerate"] === "true" && metadata["text_layer_repair"] !== "applied")
    return 0.3;
  if (provider.startsWith("pdftotext")) return 0.5;
  if (metadata["conversion_status"] === "partial_success") return 0.6;
  const grade = metadata["confidence_mean_grade"];
  if (grade === "poor") return 0.5;
  if (grade === "fair") return 0.7;
  return 0.9;
}

function revisionRights(version: {
  storageAllowed: boolean;
  extractionAllowed: boolean;
  embeddingAllowed: boolean;
  aiProcessingAllowed: boolean;
  externalProviderAllowed: boolean;
  excerptDisplayAllowed: boolean;
}): RevisionRights {
  return {
    storage: version.storageAllowed,
    extraction: version.extractionAllowed,
    embedding: version.embeddingAllowed,
    aiProcessing: version.aiProcessingAllowed,
    externalProviderProcessing: version.externalProviderAllowed,
    excerptDisplay: version.excerptDisplayAllowed,
  };
}

function normativeLanguage(language: string): NormativeLanguage {
  return language.toLowerCase().startsWith("ar") ? "ar" : "fr";
}

const MAX_PROVIDER_ERROR_LENGTH = 1_000;

async function doclingError(response: Response) {
  let detail = "";
  try {
    const body = (await response.text()).trim();
    if (body) {
      try {
        const parsed = JSON.parse(body) as { detail?: unknown };
        detail = typeof parsed.detail === "string" ? parsed.detail : body;
      } catch {
        detail = body;
      }
    }
  } catch {
    // The HTTP status is still useful when the response body cannot be read.
  }
  const status = [response.status, response.statusText].filter(Boolean).join(" ");
  const suffix = detail ? `: ${detail.slice(0, MAX_PROVIDER_ERROR_LENGTH)}` : "";
  return new Error(`Docling extraction failed (${status})${suffix}`);
}

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
  private readonly logger = createLogger({ base: { service: "qhse-worker" } });

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
        const startedAt = Date.now();
        this.logger.info(
          {
            event: "stage_started",
            stage: stage.jobType,
            documentId,
            versionId,
            jobId: stage.id,
            attempt: stage.attemptCount + 1,
          },
          "processing stage started",
        );
        const result = await this.runStage(stage.jobType as ProcessingJobType, versionId, stage.id);
        this.logger.info(
          {
            event: "stage_finished",
            stage: stage.jobType,
            documentId,
            versionId,
            jobId: stage.id,
            skipped: result.skipped === true,
            durationMs: Date.now() - startedAt,
          },
          "processing stage finished",
        );
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
      const traceId = currentTraceId();
      // The record below keeps only a truncated message, so emit the full error
      // -- stack included -- to the log pipeline. `traceId` is the join key back
      // to the trace in Tempo.
      this.logger.error(
        {
          event: "stage_failed",
          stage: active?.jobType,
          documentId,
          versionId,
          jobId: active?.id,
          attempt: active?.attemptCount,
          ...(traceId ? { traceId } : {}),
          err: error,
        },
        "processing stage failed",
      );
      if (active)
        await this.database.documentProcessingJob.update({
          where: { id: active.id },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errorCode: "PROVIDER_FAILURE",
            errorMessage: message,
            ...(traceId ? { outputMetadata: { traceId } } : {}),
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
    processingJobId: string,
  ): Promise<{
    skipped?: boolean;
    outputLocation?: string;
    metadata?: Prisma.InputJsonObject;
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
        assertRevisionRight(revisionRights(version), "extract");
        assertRevisionRight(revisionRights(version), "external-process");
        const raw = `documents/${version.documentId}/versions/${version.id}/extracted/raw.txt`;
        const normalized = `documents/${version.documentId}/versions/${version.id}/extracted/normalized.txt`;
        const pagesLocation = `documents/${version.documentId}/versions/${version.id}/extracted/pages.json`;
        const blocksLocation = `documents/${version.documentId}/versions/${version.id}/extracted/blocks.json`;
        const extracted = await this.extract(
          version.storageKey,
          version.originalFileName,
          version.mimeType,
          processingJobId,
        );
        const normalizedPages = extracted.pages.map((page) => ({
          pageNumber: page.pageNumber,
          text: normalizeExtractedText(page.text),
        }));
        const normalizedText = normalizeExtractedText(
          normalizedPages.length
            ? normalizedPages.map(({ text }) => text).join("\n\n")
            : extracted.text,
        );
        if (!normalizedText) throw new Error("Document extraction returned no text");
        // A degraded extraction still yields text, so nothing downstream fails outright -- the
        // revision simply reaches review with worse provisions. Saying so here is what makes it
        // findable, both in the logs and in the stage's own quality score.
        const quality = extractionQuality(extracted.provider, extracted.metadata);
        if (quality < 0.9)
          this.logger.warn(
            {
              event: "extraction_degraded",
              provider: extracted.provider,
              quality,
              textLayer: extracted.metadata["text_layer_reason"],
              textLayerRepair: extracted.metadata["text_layer_repair"],
              conversionStatus: extracted.metadata["conversion_status"],
              confidence: extracted.metadata["confidence_mean_grade"],
              documentId: version.documentId,
              versionId,
              jobId: processingJobId,
            },
            "document extraction is below full quality",
          );
        await Promise.all([
          this.putText(raw, extracted.text),
          this.putText(normalized, normalizedText),
          this.putJson(pagesLocation, normalizedPages),
          this.putJson(blocksLocation, extracted.blocks),
        ]);
        await this.database.documentVersion.update({
          where: { id: versionId },
          data: {
            extractionMethod: extracted.provider,
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
            provider: extracted.provider,
            characters: normalizedText.length,
            pages: extracted.pages.length || 1,
            ...(Object.keys(extracted.metadata).length
              ? { providerMetadata: extracted.metadata }
              : {}),
          },
          quality,
        };
      }
      case "ocr": {
        const needsOcr = shouldRunOcr({
          extractableCharacters: version.characterCount ?? 0,
          pageCount: version.pageCount ?? 0,
          textQuality: 1,
        });
        if (!needsOcr)
          return { skipped: true, metadata: { reason: "extractable_text_sufficient" } };
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
        return {
          metadata: {
            provider: "rules",
            revisionLabel: "platform_derived",
            reviewRequired: false,
          },
          quality: 1,
        };
      case "language_detection":
        return {
          metadata: { language: version.document.language, provider: "document_metadata" },
          quality: 1,
        };
      case "structure_detection": {
        const text = await this.getText(version.normalizedTextLocation);
        const language = normativeLanguage(version.document.language);
        const sections = detectSections(text);
        // Labeled blocks carry the layout facts that flattened page text has already lost:
        // page furniture, table boundaries, and which headings group provisions rather than
        // open one. Versions extracted before blocks were stored fall back to page text.
        const blocks = await this.getExtractedBlocks(version.documentId, version.id);
        const provisions = blocks.length
          ? detectNormativeProvisionsFromBlocks(blocks, language)
          : detectNormativeProvisions(
              await this.getExtractedPages(version.documentId, version.id, text),
              language,
            );
        // The way segmentation goes wrong is quiet: it still yields provisions and chunks, just
        // the wrong ones, and nothing downstream notices until a reviewer reads them or a
        // citation lands on the wrong article. Scoring the structure is what makes that visible.
        const structure = assessStructureQuality(blocks, provisions);
        if (structure.score < STRUCTURE_REVIEW_THRESHOLD)
          this.logger.warn(
            {
              event: "structure_quality_low",
              score: structure.score,
              concerns: structure.concerns,
              documentId: version.documentId,
              versionId,
              jobId: processingJobId,
            },
            "segmented structure is below the review threshold",
          );
        await this.database.$transaction([
          this.database.documentChunk.deleteMany({ where: { documentVersionId: versionId } }),
          this.database.documentProvision.deleteMany({ where: { documentVersionId: versionId } }),
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
          this.database.documentProvision.createMany({
            data: provisions.map((provision) => ({
              documentVersionId: versionId,
              provisionType: provision.type.toUpperCase() as
                "CLAUSE" | "ARTICLE" | "DEFINITION" | "ANNEX" | "TABLE" | "NOTE" | "SECTION",
              sourceIdentifier: provision.sourceIdentifier,
              title: provision.title,
              headingPath: provision.headingPath,
              language: provision.language,
              content: provision.content,
              contentHash: provision.contentHash,
              pageStart: provision.pageStart,
              pageEnd: provision.pageEnd,
              orderIndex: provision.orderIndex,
              sourceLocation: {
                pageStart: provision.pageStart,
                pageEnd: provision.pageEnd,
                method: "normative-structure-v1",
              },
            })),
          }),
        ]);
        return {
          metadata: {
            provider: "normative-structure-v1",
            sections: String(sections.length),
            provisions: String(provisions.length),
            identified: String(structure.signals.identified),
            identifierCoverage: Number(structure.signals.identifierCoverage.toFixed(3)),
            fragments: String(structure.signals.fragments),
            missingNumbers: structure.signals.missingNumbers.slice(0, 20).join(","),
            duplicateIdentifiers: structure.signals.duplicateIdentifiers.slice(0, 20).join(","),
            ...(structure.concerns.length ? { concerns: structure.concerns } : {}),
          },
          quality: structure.score,
        };
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
        const provisions = await this.database.documentProvision.findMany({
          where: { documentVersionId: versionId },
          orderBy: { orderIndex: "asc" },
        });
        const chunks = chunkNormativeProvisions(
          provisions.map((provision) => ({
            type: provision.provisionType.toLowerCase() as ProvisionType,
            sourceIdentifier: provision.sourceIdentifier,
            title: provision.title,
            headingPath: provision.headingPath,
            language: normativeLanguage(provision.language),
            content: provision.content,
            contentHash: provision.contentHash,
            pageStart: provision.pageStart ?? 1,
            pageEnd: provision.pageEnd ?? provision.pageStart ?? 1,
            orderIndex: provision.orderIndex,
          })),
          {
            documentTitle: version.document.title,
            referenceNumber: version.document.referenceNumber,
            sourceEdition: version.sourceEdition,
          },
        );
        const provisionIds = new Map(
          provisions.map((provision) => [provision.orderIndex, provision.id]),
        );
        await this.database.$transaction([
          this.database.documentChunk.deleteMany({ where: { documentVersionId: versionId } }),
          this.database.documentChunk.createMany({
            data: chunks.map((content) => ({
              documentVersionId: versionId,
              documentProvisionId: provisionIds.get(content.provisionOrderIndex) ?? null,
              chunkIndex: content.chunkIndex,
              content: content.content,
              searchText: content.searchText,
              language: content.language,
              headingPath: content.headingPath,
              tokenCount: content.tokenCount,
              pageStart: content.pageStart,
              pageEnd: content.pageEnd,
              contentHash: content.contentHash,
              chunkingVersion: "normative-v3",
              embeddingStatus: "PENDING",
              sourceLocation: {
                provisionOrderIndex: content.provisionOrderIndex,
                pageStart: content.pageStart,
                pageEnd: content.pageEnd,
              },
            })),
          }),
          this.database.documentVersion.update({
            where: { id: versionId },
            data: { chunkingVersion: "normative-v3" },
          }),
        ]);
        return {
          metadata: { provider: "normative-v3", chunks: String(chunks.length) },
          quality: 0.9,
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
        assertRevisionRight(revisionRights(version), "embed");
        assertRevisionRight(revisionRights(version), "ai-process");
        assertRevisionRight(revisionRights(version), "external-process");
        return llmSettings().ragEnabled
          ? { metadata: { configured: true, queue: "embedding-generation" } }
          : { skipped: true, metadata: { reason: "disabled" } };
      default:
        return { metadata: { provider: "mock", reviewRequired: true }, quality: 0.5 };
    }
  }

  private async extract(
    storageKey: string,
    fileName: string,
    mimeType: string,
    correlationId: string,
  ): Promise<ExtractedDocument> {
    const object = await this.storage.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    if (!object.Body) throw new Error("Uploaded document is missing from object storage");
    const bytes = await object.Body.transformToByteArray();
    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      const text = new TextDecoder().decode(bytes);
      return {
        text,
        pages: [{ pageNumber: 1, text }],
        blocks: [{ blockType: "paragraph", pageNumber: 1, text }],
        provider: "native_text",
        metadata: {},
      };
    }
    const form = new FormData();
    form.append("file", new Blob([bytes.slice().buffer], { type: mimeType }), fileName);
    const response = await fetch(`${process.env["DOCLING_URL"]}/v1/extract`, {
      method: "POST",
      body: form,
      headers: { "x-correlation-id": correlationId },
      signal: AbortSignal.timeout(10 * 60 * 1_000),
    });
    if (!response.ok) throw await doclingError(response);
    const result = (await response.json()) as {
      text: string;
      pages?: Array<{ page_number: number; text: string }>;
      blocks?: Array<{
        block_type: string;
        text: string;
        page_number: number;
        bounding_box?: number[];
        heading_level?: number;
      }>;
      metadata?: Record<string, string>;
    };
    return {
      text: result.text,
      pages: (result.pages ?? []).map((page) => ({
        pageNumber: page.page_number,
        text: page.text,
      })),
      blocks: (result.blocks ?? []).map((block) => ({
        blockType: block.block_type,
        text: block.text,
        pageNumber: block.page_number,
        ...(block.bounding_box ? { boundingBox: block.bounding_box } : {}),
        ...(typeof block.heading_level === "number" ? { headingLevel: block.heading_level } : {}),
      })),
      provider: extractionProvider(result.metadata?.["provider"]),
      metadata: result.metadata ?? {},
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

  private async putJson(key: string, value: unknown) {
    await this.storage.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: JSON.stringify(value),
        ContentType: "application/json; charset=utf-8",
      }),
    );
  }

  private async getExtractedPages(
    documentId: string,
    versionId: string,
    fallbackText: string,
  ): Promise<ExtractedPage[]> {
    const key = `documents/${documentId}/versions/${versionId}/extracted/pages.json`;
    try {
      const object = await this.storage.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!object.Body) return [{ pageNumber: 1, text: fallbackText }];
      const parsed = JSON.parse(await object.Body.transformToString()) as ExtractedPage[];
      return parsed.length ? parsed : [{ pageNumber: 1, text: fallbackText }];
    } catch {
      return [{ pageNumber: 1, text: fallbackText }];
    }
  }

  /** Empty when the version predates block storage, or its extractor produced no labels. */
  private async getExtractedBlocks(
    documentId: string,
    versionId: string,
  ): Promise<ExtractedBlock[]> {
    const key = `documents/${documentId}/versions/${versionId}/extracted/blocks.json`;
    try {
      const object = await this.storage.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!object.Body) return [];
      const parsed: unknown = JSON.parse(await object.Body.transformToString());
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((entry): ExtractedBlock[] => {
        if (typeof entry !== "object" || entry === null) return [];
        const { blockType, text, pageNumber, headingLevel } = entry as Record<string, unknown>;
        if (typeof text !== "string" || !text.trim()) return [];
        return [
          {
            blockType: typeof blockType === "string" ? blockType : "text",
            text,
            pageNumber: typeof pageNumber === "number" ? pageNumber : 1,
            ...(typeof headingLevel === "number" && Number.isInteger(headingLevel)
              ? { headingLevel }
              : {}),
          },
        ];
      });
    } catch {
      return [];
    }
  }

  private async getText(key: string | null) {
    if (!key) throw new Error("Normalized extracted text is unavailable");
    const object = await this.storage.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!object.Body) throw new Error("Normalized extracted text is missing from object storage");
    return object.Body.transformToString();
  }
}
