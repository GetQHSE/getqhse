import { describe, expect, it, vi } from "vitest";
import { UnprocessableEntityException } from "@nestjs/common";
import { AiPromptsController } from "./ai-prompts.controller.js";

describe("AI prompt request validation", () => {
  const service = {
    create: vi.fn(),
    publish: vi.fn(),
    test: vi.fn(),
    validate: vi.fn(),
    updateSource: vi.fn(),
  };
  const controller = new AiPromptsController(service as never);
  const request = { platformUser: { id: "authenticated-editor" } } as never;

  it("validates source changes and uses the authenticated actor", async () => {
    await controller.updateSource(request, { source: "CODE", expectedGeneration: 0 });
    expect(service.updateSource).toHaveBeenCalledWith(
      { id: "authenticated-editor" },
      { source: "CODE", expectedGeneration: 0 },
    );
    for (const input of [
      { source: "OTHER", expectedGeneration: 0 },
      { source: "CODE" },
      { source: "CODE", expectedGeneration: 0, updatedByUserId: "other" },
    ])
      expect(() => controller.updateSource(request, input)).toThrow(UnprocessableEntityException);
  });

  it("uses the authenticated actor and rejects client-supplied actor fields", async () => {
    await controller.create(request, "context.internal-issues", {
      template: "Template",
      changeNote: "PO review",
    });
    expect(service.create).toHaveBeenCalledWith(
      { id: "authenticated-editor" },
      "context.internal-issues",
      { template: "Template", changeNote: "PO review" },
    );
    expect(() =>
      controller.create(request, "context.internal-issues", {
        template: "Template",
        changeNote: "PO review",
        createdById: "other-admin",
      }),
    ).toThrow(UnprocessableEntityException);
  });

  it("rejects publication without a generation and invalid reset/revision combinations", () => {
    expect(() =>
      controller.publish(request, "context.internal-issues", {
        revisionId: "rev",
        action: "PUBLISH",
        note: "PO review",
      }),
    ).toThrow(UnprocessableEntityException);
    expect(() =>
      controller.publish(request, "context.internal-issues", {
        revisionId: "rev",
        action: "RESET",
        note: "PO review",
        expectedGeneration: 0,
      }),
    ).toThrow(UnprocessableEntityException);
    expect(service.publish).not.toHaveBeenCalled();
  });

  it("bounds sample inputs and validates languages and validation notes", () => {
    expect(() =>
      controller.test(request, "context.internal-issues", "rev", {
        context: "x".repeat(40001),
        language: "fr",
      }),
    ).toThrow(UnprocessableEntityException);
    expect(() =>
      controller.test(request, "context.internal-issues", "rev", {
        context: "Synthetic facts",
        language: "de",
      }),
    ).toThrow(UnprocessableEntityException);
    expect(() =>
      controller.validate(request, "context.internal-issues", "rev", { note: "yes" }),
    ).toThrow(UnprocessableEntityException);
  });
});
