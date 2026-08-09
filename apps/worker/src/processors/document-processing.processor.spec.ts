import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createPrismaClientMock } = vi.hoisted(() => ({
  createPrismaClientMock: vi.fn(),
}));

vi.mock("@qhse/database", () => ({
  createPrismaClient: createPrismaClientMock,
}));

import {
  chunkText,
  detectSections,
  DocumentProcessingProcessor,
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
