import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generated = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({
  generateText: generated,
  Output: { object: vi.fn(({ schema }) => ({ schema })) },
}));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: () => ({ responses: vi.fn() }) }));

import { classifyLaw, detectLawMetadata, structureLaw } from "./law-ingestion.js";

beforeEach(() => {
  generated.mockReset();
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LLM-assisted law upload", () => {
  it("stores model-selected source ranges with unchanged French and Arabic text", async () => {
    generated.mockResolvedValue({
      output: {
        nodes: [
          {
            ranges: [{ startBlock: 0, endBlock: 1 }],
            type: "article",
            identifier: "المادة 1",
            title: null,
            headingPath: [],
          },
        ],
      },
    });
    const blocks = [
      { blockType: "heading", pageNumber: 2, text: "المادة 1" },
      { blockType: "text", pageNumber: 2, text: "نص قانوني — texte original." },
    ];
    await expect(structureLaw(blocks, "ar")).resolves.toMatchObject([
      { content: "المادة 1\n\nنص قانوني — texte original.", language: "ar" },
    ]);
  });

  it("rejects an oversized source before spending a model call instead of truncating it", async () => {
    await expect(
      structureLaw([{ blockType: "text", pageNumber: 1, text: "x".repeat(180_001) }], "fr"),
    ).rejects.toThrow(/too large/);
    expect(generated).not.toHaveBeenCalled();
  });

  it("selects only existing semantic taxonomy terms", async () => {
    const terms = [{ id: "safety", key: "health_safety", label: "Santé et sécurité" }];
    generated.mockResolvedValue({ output: { termIds: ["safety"] } });
    await expect(classifyLaw("Protection des salariés", terms)).resolves.toEqual(terms);
    generated.mockResolvedValue({ output: { termIds: ["invented"] } });
    await expect(classifyLaw("Protection des salariés", terms)).rejects.toThrow(/unknown/);
  });

  it("keeps grounded metadata and drops invalid suggestions without failing the upload", async () => {
    generated.mockResolvedValue({
      output: {
        suggestions: [
          { fieldName: "title", value: "Sécurité", sourceText: "Loi 1 sur la Sécurité" },
          {
            fieldName: "referenceNumber",
            value: "Loi 1",
            sourceText: "Loi 1  sur la Sécurité",
          },
        ],
      },
    });
    await expect(detectLawMetadata("Loi 1 sur la Sécurité")).resolves.toEqual([
      { fieldName: "title", value: "Sécurité", sourceText: "Loi 1 sur la Sécurité" },
    ]);
  });

  it("drops ambiguous duplicate fields while preserving other grounded metadata", async () => {
    generated.mockResolvedValue({
      output: {
        suggestions: [
          { fieldName: "title", value: "Loi 1", sourceText: "Loi 1 sur la Sécurité" },
          { fieldName: "title", value: "Sécurité", sourceText: "Loi 1 sur la Sécurité" },
          {
            fieldName: "issuingAuthority",
            value: "Ministère",
            sourceText: "Ministère de la Justice",
          },
        ],
      },
    });
    await expect(
      detectLawMetadata("Loi 1 sur la Sécurité\nMinistère de la Justice"),
    ).resolves.toEqual([
      {
        fieldName: "issuingAuthority",
        value: "Ministère",
        sourceText: "Ministère de la Justice",
      },
    ]);
  });
});
