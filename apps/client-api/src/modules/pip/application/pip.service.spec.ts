import { BadRequestException, NotFoundException, ConflictException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipRegister } from "@qhse/contracts";
import { PipService } from "./pip.service.js";

const tenant = { organizationId: "org-1", userId: "user-1", role: "member" };
const partyContent = {
  name: "Customers",
  description: "Organisation customers",
  category: "Customers",
  scope: "external" as const,
  relevance: "relevant" as const,
  reasoning: "Validated profile",
  confidence: 0.8,
  evidence: [],
};
function database() {
  const tx = {
    $queryRaw: vi.fn(),
    pipState: {
      upsert: vi.fn().mockResolvedValue({ revision: 3, evaluationMethod: "both" }),
      update: vi.fn(),
    },
    pipParty: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    pipRequirement: { findFirst: vi.fn(), update: vi.fn() },
    pipEvaluation: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    pipCorrection: { create: vi.fn() },
    pipClarification: { findFirst: vi.fn(), update: vi.fn() },
  };
  return {
    ...tx,
    project: { findFirst: vi.fn().mockResolvedValue({ id: "project-1" }) },
    $transaction: vi.fn(async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx)),
  };
}
describe("PipService review and tenancy", () => {
  let db: ReturnType<typeof database>;
  let service: PipService;
  beforeEach(() => {
    db = database();
    service = new PipService({ enqueue: vi.fn() } as never, db as never);
    vi.spyOn(service, "register").mockResolvedValue({} as PipRegister);
  });
  it("resolves project slugs only inside the authenticated tenant", async () => {
    db.project.findFirst.mockResolvedValue(null);
    await expect(
      service.review(tenant, "project-1", {
        entityType: "party",
        entityId: "foreign-party",
        reviewStatus: "VALIDATED",
        reason: "Reviewed by member",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.project.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        archivedAt: null,
        OR: [{ id: "project-1" }, { slug: "project-1" }],
      },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it.each(["party", "requirement", "evaluation"] as const)(
    "re-resolves %s IDs under the project before writing",
    async (entityType) => {
      await expect(
        service.review(tenant, "project-1", {
          entityType,
          entityId: "foreign",
          reviewStatus: "VALIDATED",
          reason: "Professional decision",
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      const table =
        entityType === "party"
          ? db.pipParty
          : entityType === "requirement"
            ? db.pipRequirement
            : db.pipEvaluation;
      expect(table.findFirst).toHaveBeenCalledWith({
        where: {
          id: "foreign",
          ...(entityType === "party"
            ? { projectId: "project-1" }
            : { party: { projectId: "project-1" } }),
        },
      });
      expect(db.pipCorrection.create).not.toHaveBeenCalled();
    },
  );
  it("keeps AI proposals immutable and audits effective human edits", async () => {
    db.pipParty.findFirst.mockResolvedValue({
      id: "party-1",
      effective: partyContent,
      reviewStatus: "PENDING",
    });
    await service.review(tenant, "project-1", {
      entityType: "party",
      entityId: "party-1",
      content: { ...partyContent, name: "Enterprise customers", confidence: 1 },
      reviewStatus: "MODIFIED",
      reason: "Clarified customer scope",
    });
    const update = db.pipParty.update.mock.calls[0]![0].data;
    expect(update).not.toHaveProperty("aiProposal");
    expect(update.effective.name).toBe("Enterprise customers");
    expect(update.effective.confidence).toBe(0.8);
    expect(db.pipCorrection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorId: "user-1",
          projectId: "project-1",
          entityId: "party-1",
        }),
      }),
    );
    expect(db.pipState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { revision: { increment: 1 }, validatedAt: null, validatedById: null },
      }),
    );
    expect(db.pipEvaluation.updateMany).toHaveBeenCalledWith({
      where: { partyId: "party-1" },
      data: { reviewStatus: "PENDING" },
    });
  });
  it("rejects service allocation against a foreign or unretained requirement", async () => {
    await expect(
      service.allocate(tenant, "project-1", {
        requirementId: "foreign",
        services: ["Quality"],
        noServiceConfirmed: false,
        reason: "Reviewed allocation",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.pipRequirement.update).not.toHaveBeenCalled();
  });
  it("does not allocate a need", async () => {
    db.pipRequirement.findFirst.mockResolvedValue({
      id: "need-1",
      effective: {
        kind: "need",
        text: "Prompt service",
        reasoning: "Customer needs",
        sourceType: "stakeholder_expectation",
        regulatoryEntryId: null,
        sourceLabel: null,
        sourceUrl: null,
      },
    });
    await expect(
      service.allocate(tenant, "project-1", {
        requirementId: "need-1",
        services: ["Quality"],
        noServiceConfirmed: false,
        reason: "Reviewed allocation",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it("checks duplicate manual parties before creating or auditing", async () => {
    db.pipParty.findUnique.mockResolvedValue({ id: "existing" });
    await expect(service.addParty(tenant, "project-1", partyContent)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.pipParty.create).not.toHaveBeenCalled();
  });
});
