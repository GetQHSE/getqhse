import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeLibraryService } from "./knowledge-library.service.js";

const actor = (platformRole: string) => ({ id: "operator-1", platformRole }) as never;

describe("KnowledgeLibraryService", () => {
  it("allows content managers to create sanitized drafts and keeps support read-only", async () => {
    const create = vi.fn().mockResolvedValue({ id: "example-1", feature: "DISCOVERY" });
    const service = new KnowledgeLibraryService(
      { database: { aiKnowledgeExample: { create } } } as never,
      { add: vi.fn() } as never,
    );
    const input = {
      feature: "DISCOVERY" as const,
      title: "Installations classées",
      scenarioSummary: "Site industriel exploitant des produits dangereux.",
      guidance: "Vérifier le lien matériel avec les activités déclarées.",
      jurisdiction: "MA",
      language: "fr" as const,
      tags: ["industrie"],
      rating: 4,
      payload: {
        includedLaws: [
          {
            reference: "Loi 11-03",
            title: "Protection de l'environnement",
            reason: "Les impacts potentiels justifient son examen.",
          },
        ],
        excludedLaws: [],
      },
    };

    await expect(service.create(actor("content_manager"), input)).resolves.toMatchObject({
      id: "example-1",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "ADMIN", status: "DRAFT" }),
      }),
    );
    await expect(service.create(actor("support"), input)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("permanently deletes the example while retaining a content-free audit event", async () => {
    const activityCreate = vi.fn();
    const exampleDelete = vi.fn();
    const database = {
      aiKnowledgeExample: {
        findUnique: vi.fn().mockResolvedValue({ id: "example-1", feature: "DISCOVERY" }),
      },
      $transaction: (work: (tx: unknown) => unknown) =>
        work({
          aiKnowledgeActivity: { create: activityCreate },
          aiKnowledgeExample: { delete: exampleDelete },
        }),
    };
    const service = new KnowledgeLibraryService({ database } as never, { add: vi.fn() } as never);

    await service.delete(actor("platform_admin"), "example-1");

    expect(activityCreate).toHaveBeenCalledWith({
      data: {
        exampleId: "example-1",
        feature: "DISCOVERY",
        action: "DELETED",
        actorUserId: "operator-1",
      },
    });
    expect(exampleDelete).toHaveBeenCalledWith({ where: { id: "example-1" } });
  });
});
