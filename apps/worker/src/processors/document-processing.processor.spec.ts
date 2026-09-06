import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createPrismaClientMock } = vi.hoisted(() => ({
  createPrismaClientMock: vi.fn(),
}));

vi.mock("@qhse/database", () => ({
  createPrismaClient: createPrismaClientMock,
}));

vi.mock("./law-ingestion.js", () => ({
  structureLaw: vi.fn(),
  classifyLaw: vi.fn(),
  detectLawMetadata: vi.fn(),
}));
import { structureLaw } from "./law-ingestion.js";

import {
  chunkText,
  detectSections,
  DocumentProcessingProcessor,
  extractionQuality,
} from "./document-processing.processor.js";

const stage = { id: "job-extraction", jobType: "text_extraction", status: "PENDING" };
const version = {
  id: "version-1",
  documentId: "document-1",
  storageKey: "documents/document-1/versions/version-1/original/policy.pdf",
  originalFileName: "policy.pdf",
  mimeType: "application/pdf",
  versionLabel: "1.0",
  createdByUserId: "user-1",
  storageAllowed: true,
  extractionAllowed: true,
  embeddingAllowed: true,
  aiProcessingAllowed: true,
  externalProviderAllowed: true,
  excerptDisplayAllowed: true,
  document: { language: "fr" },
};

function createExtractionHarness(failing = false) {
  const documentVersionUpdate = vi.fn().mockResolvedValue({});
  const processingJobFindFirst = failing
    ? vi.fn().mockResolvedValueOnce(stage).mockResolvedValueOnce(stage)
    : vi.fn().mockResolvedValue(stage);
  const processingJobUpdate = vi.fn().mockResolvedValue({});
  const database = {
    documentVersion: {
      update: documentVersionUpdate,
      findUniqueOrThrow: vi.fn().mockResolvedValue(version),
    },
    documentProcessingJob: {
      findFirst: processingJobFindFirst,
      update: processingJobUpdate,
    },
    document: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    documentActivity: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  const storageCommands: unknown[] = [];
  const storageSend = vi.fn().mockImplementation(async (command: unknown) => {
    storageCommands.push(command);
    if (command instanceof GetObjectCommand) {
      return {
        Body: {
          transformToByteArray: async () => new TextEncoder().encode("representative-pdf-bytes"),
        },
      };
    }
    if (command instanceof PutObjectCommand) return {};
    throw new Error("Unexpected storage command");
  });
  createPrismaClientMock.mockReturnValue(database);
  const processor = new DocumentProcessingProcessor();
  Object.defineProperty(processor, "storage", { value: { send: storageSend } });
  const queueJob = {
    data: {
      documentId: version.documentId,
      versionId: version.id,
      jobIds: [stage.id],
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  };
  return {
    database,
    documentVersionUpdate,
    processingJobUpdate,
    processor,
    queueJob,
    storageCommands,
    storageSend,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("document processing review outputs", () => {
  it("detects titled sections while preserving their content", () => {
    const sections = detectSections(
      "1 Scope\n\nThis standard covers occupational safety.\n\n2 Requirements\n\nWorkers must use protective equipment.",
    );

    expect(sections).toEqual([
      {
        title: "1 Scope",
        content: "This standard covers occupational safety.",
        orderIndex: 0,
      },
      {
        title: "2 Requirements",
        content: "Workers must use protective equipment.",
        orderIndex: 1,
      },
    ]);
  });

  it("creates stable non-empty chunks without dropping paragraphs", () => {
    const chunks = chunkText("First paragraph.\n\nSecond paragraph.\n\nThird paragraph.", 35);

    expect(chunks).toEqual(["First paragraph.\n\nSecond paragraph.", "Third paragraph."]);
    expect(chunks.join("\n\n")).toContain("Second paragraph.");
  });
});

describe("extraction quality", () => {
  it("scores an unusable text layer below a plain fallback", () => {
    // A PDF whose fonts never decoded still yields plenty of characters, so every count-based
    // check downstream passes and the garbage reaches a reviewer looking ordinary. It has to
    // score worse than a fallback that at least got the words right.
    const unusable = extractionQuality("docling", {
      text_layer_degenerate: "true",
      text_layer_reason: "control_characters_in_text",
    });

    expect(unusable).toBeLessThan(extractionQuality("pdftotext+ocr", {}));
    expect(unusable).toBeLessThan(extractionQuality("docling", {}));
  });

  it("restores full quality once the forced OCR pass repaired the text layer", () => {
    expect(
      extractionQuality("docling+full_page_ocr", {
        text_layer_degenerate: "false",
        text_layer_repair: "applied",
      }),
    ).toBe(0.9);
  });

  it("follows the converter's own verdict when it reports one", () => {
    expect(extractionQuality("docling", { conversion_status: "partial_success" })).toBe(0.6);
    expect(extractionQuality("docling", { confidence_mean_grade: "poor" })).toBe(0.5);
    expect(extractionQuality("docling", { confidence_mean_grade: "fair" })).toBe(0.7);
    expect(extractionQuality("docling", { confidence_mean_grade: "excellent" })).toBe(0.9);
  });
});

describe("DocumentProcessingProcessor Docling extraction", () => {
  it("posts the stored document to Docling and persists its real extraction output", async () => {
    vi.stubEnv("DOCLING_URL", "http://docling.test");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: "QHSE policy\r\n\r\nWorkers must report incidents.",
          pages: [
            { page_number: 1, text: "QHSE policy" },
            { page_number: 2, text: "Workers must report incidents." },
          ],
          blocks: [
            { block_type: "title", text: "QHSE policy", page_number: 1 },
            { block_type: "paragraph", text: "Workers must report incidents.", page_number: 2 },
          ],
          metadata: { content_type: "application/pdf", correlation_id: stage.id },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const harness = createExtractionHarness();

    await expect(harness.processor.process(harness.queueJob as never)).resolves.toEqual({
      versionId: version.id,
      status: "review_required",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://docling.test/v1/extract",
      expect.objectContaining({
        method: "POST",
        headers: { "x-correlation-id": stage.id },
      }),
    );
    const form = fetchMock.mock.calls[0]?.[1]?.body;
    expect(form).toBeInstanceOf(FormData);
    expect((form as FormData).get("file")).toMatchObject({
      name: version.originalFileName,
      type: version.mimeType,
    });

    const writes = harness.storageCommands.filter(
      (command): command is PutObjectCommand => command instanceof PutObjectCommand,
    );
    expect(writes).toHaveLength(4);
    expect(writes.slice(0, 2).map(({ input }) => [input.Key, input.Body])).toEqual([
      [
        "documents/document-1/versions/version-1/extracted/raw.txt",
        "QHSE policy\r\n\r\nWorkers must report incidents.",
      ],
      [
        "documents/document-1/versions/version-1/extracted/normalized.txt",
        "QHSE policy\n\nWorkers must report incidents.",
      ],
    ]);
    expect(harness.documentVersionUpdate).toHaveBeenCalledWith({
      where: { id: version.id },
      data: expect.objectContaining({
        extractionMethod: "docling",
        rawExtractedTextLocation: "documents/document-1/versions/version-1/extracted/raw.txt",
        normalizedTextLocation: "documents/document-1/versions/version-1/extracted/normalized.txt",
        pageCount: 2,
        wordCount: 6,
        characterCount: 43,
      }),
    });
    expect(harness.processingJobUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: stage.id },
      data: expect.objectContaining({ status: "RUNNING" }),
    });
    expect(harness.processingJobUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: stage.id },
      data: expect.objectContaining({
        status: "COMPLETED",
        outputLocation: "documents/document-1/versions/version-1/extracted/normalized.txt",
        outputMetadata: {
          provider: "docling",
          characters: 43,
          pages: 2,
          providerMetadata: {
            content_type: "application/pdf",
            correlation_id: stage.id,
          },
        },
        errorCode: null,
        errorMessage: null,
      }),
    });
    expect(harness.documentVersionUpdate).toHaveBeenCalledWith({
      where: { id: version.id },
      data: {
        status: "REVIEW_REQUIRED",
        processingStatus: "COMPLETED",
        reviewStatus: "NOT_STARTED",
        processingError: null,
      },
    });
    expect(harness.database.document.updateMany).toHaveBeenCalledWith({
      where: { id: version.documentId, currentVersionId: null },
      data: { status: "REVIEW_REQUIRED" },
    });
    expect(harness.queueJob.updateProgress).toHaveBeenCalledWith({
      stage: "text_extraction",
      completed: 1,
      total: 1,
    });
  });

  it("records the extractor's own fallback instead of reporting every run as Docling", async () => {
    vi.stubEnv("DOCLING_URL", "http://docling.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            text: "Article premier\n\nContenu.",
            pages: [{ page_number: 1, text: "Article premier\n\nContenu." }],
            blocks: [
              { block_type: "paragraph", text: "Article premier\n\nContenu.", page_number: 1 },
            ],
            // Docling raised and the service degraded to poppler with a per-page OCR pass.
            metadata: { provider: "pdftotext+ocr" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const harness = createExtractionHarness();

    await harness.processor.process(harness.queueJob as never);

    // Recording "docling" for a run with no layout labels left no way to ask which revisions
    // were segmented from flat text and are worth re-extracting.
    expect(harness.documentVersionUpdate).toHaveBeenCalledWith({
      where: { id: version.id },
      data: expect.objectContaining({ extractionMethod: "pdftotext+ocr" }),
    });
    expect(harness.processingJobUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: stage.id },
      data: expect.objectContaining({
        status: "COMPLETED",
        qualityScore: 0.5,
        outputMetadata: expect.objectContaining({ provider: "pdftotext+ocr" }),
      }),
    });
  });

  it("persists Docling response details while preserving the failure transitions", async () => {
    vi.stubEnv("DOCLING_URL", "http://docling.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Converter rejected the damaged PDF" }), {
          status: 422,
          statusText: "Unprocessable Entity",
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const harness = createExtractionHarness(true);
    const failure =
      "Docling extraction failed (422 Unprocessable Entity): Converter rejected the damaged PDF";

    await expect(harness.processor.process(harness.queueJob as never)).rejects.toThrow(failure);

    expect(harness.processingJobUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: stage.id },
      data: expect.objectContaining({ status: "RUNNING" }),
    });
    expect(harness.processingJobUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: stage.id },
      data: expect.objectContaining({
        status: "FAILED",
        errorCode: "PROVIDER_FAILURE",
        errorMessage: failure,
      }),
    });
    expect(harness.documentVersionUpdate).toHaveBeenCalledWith({
      where: { id: version.id },
      data: expect.objectContaining({
        status: "PROCESSING_FAILED",
        processingStatus: "FAILED",
        processingError: failure,
      }),
    });
    expect(harness.database.document.updateMany).toHaveBeenCalledWith({
      where: { id: version.documentId, currentVersionId: null },
      data: { status: "PROCESSING_FAILED" },
    });
    expect(harness.database.documentActivity.create).toHaveBeenCalledWith({
      data: {
        documentId: version.documentId,
        documentVersionId: version.id,
        action: "document.processing_failed",
        metadata: { errorCode: "PROVIDER_FAILURE" },
      },
    });
    expect(harness.storageSend).toHaveBeenCalledTimes(1);
  });
});

describe("law hierarchy persistence", () => {
  it("attaches unsectioned articles to the law root and nested articles to their own section", async () => {
    const source = {
      language: "fr",
      content: "Article 1 — Contenu juridique original.",
      contentHash: "hash",
      pageStart: 1,
      pageEnd: 1,
    };
    vi.mocked(structureLaw).mockResolvedValue([
      {
        ...source,
        language: "fr",
        type: "article",
        sourceIdentifier: "Article 1",
        title: null,
        headingPath: [],
        orderIndex: 0,
      },
      {
        ...source,
        language: "fr",
        type: "article",
        sourceIdentifier: "Article 2",
        title: null,
        headingPath: ["Titre I", "Chapitre I"],
        orderIndex: 1,
      },
    ]);
    const sections = vi.fn().mockResolvedValue({ count: 3 });
    const provisions = vi.fn().mockResolvedValue({ count: 2 });
    createPrismaClientMock.mockReturnValue({
      documentVersion: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ ...version, document: { title: "Loi test", language: "fr" } }),
      },
      documentChunk: { deleteMany: vi.fn() },
      documentProvision: { deleteMany: vi.fn(), createMany: provisions },
      documentSection: { deleteMany: vi.fn(), createMany: sections },
      $transaction: vi.fn().mockResolvedValue([]),
    });
    const processor = new DocumentProcessingProcessor();
    Object.defineProperty(processor, "getText", {
      value: vi.fn().mockResolvedValue(source.content),
    });
    Object.defineProperty(processor, "getExtractedBlocks", {
      value: vi
        .fn()
        .mockResolvedValue([{ blockType: "text", text: source.content, pageNumber: 1 }]),
    });
    await (
      processor as unknown as {
        runStage(stage: string, versionId: string, jobId: string): Promise<unknown>;
      }
    ).runStage("structure_detection", "version-1", "job-1");
    const rows = sections.mock.calls[0]![0].data;
    expect(rows[0]).toMatchObject({ title: "Loi test", parentSectionId: null });
    expect(rows[1].parentSectionId).toBe(rows[0].id);
    expect(rows[2].parentSectionId).toBe(rows[1].id);
    expect(rows[0].content).toBe(source.content);
    expect(rows[2].content).toBe(source.content);
    const articles = provisions.mock.calls[0]![0].data;
    expect(articles[0].documentSectionId).toBe(rows[0].id);
    expect(articles[1].documentSectionId).toBe(rows[2].id);
  });
});
