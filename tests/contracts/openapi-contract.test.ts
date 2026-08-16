import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  createSiteSchema,
  normativeSearchRequestSchema,
  portableProjectProfileSchema,
  regulatoryWatchSchema,
  siteSchema,
} from "@qhse/contracts";

const openApiPath = new URL("../../apps/client-api/openapi.json", import.meta.url);

describe("OpenAPI and Zod contracts", () => {
  it("keeps the generated site client surface compatible", () => {
    expect(createSiteSchema.keyof().options.sort()).toEqual(["address", "code", "name"]);
    expect(siteSchema.keyof().options).toContain("organizationId");
  });

  it("rejects tenant identifiers from normative search input", () => {
    const parsed = normativeSearchRequestSchema.parse({
      query: "clause 4.1",
      organizationId: "untrusted-tenant",
    });
    expect(parsed).not.toHaveProperty("organizationId");
  });

  it("exposes successive analysis lineage, diffs, and synchronization state", () => {
    const watch = regulatoryWatchSchema.parse({
      id: "watch-1",
      projectId: "project-1",
      status: "REVIEW_REQUIRED",
      revision: 4,
      currentAnalysis: {
        id: "run-2",
        profileSnapshotId: "snapshot-2",
        baseBaselineId: "baseline-1",
        triggerType: "DOCUMENT_REVISION",
        triggerDocumentVersionId: "revision-2",
        status: "READY_FOR_REVIEW",
        asOf: "2026-08-10",
        languages: ["fr", "ar"],
        phase: "review",
        progressPercent: 100,
        coverage: { completed: 16, total: 16 },
        usage: {
          inputTokens: 12_000,
          outputTokens: 4_000,
          reasoningTokens: 1_000,
          estimatedCostUsd: 0.011,
          budgetUsd: 1,
        },
        clarificationRevision: 0,
        clarifications: [],
        candidates: [],
        diff: { added: 1, unchanged: 12, modified: 2, removalProposed: 1, requiresReview: 4 },
        error: null,
        createdAt: "2026-08-10T12:00:00.000Z",
        completedAt: "2026-08-10T12:02:00.000Z",
      },
      currentBaseline: null,
      synchronization: {
        state: "CHANGES_READY",
        trigger: "DOCUMENT_REVISION",
        sourceBaselineId: "baseline-1",
        progressPercent: 100,
        lastCheckedAt: "2026-08-10T12:02:00.000Z",
        lastSuccessfulSyncAt: "2026-08-09T08:00:00.000Z",
      },
      createdAt: "2026-08-09T08:00:00.000Z",
      updatedAt: "2026-08-10T12:02:00.000Z",
    });
    expect(watch.currentAnalysis?.diff).toMatchObject({ modified: 2, removalProposed: 1 });
    expect(watch.synchronization.state).toBe("CHANGES_READY");
  });

  it("keeps portable profiles versioned, tenant-free, and duplicate-safe", () => {
    const base = {
      format: "qhse-project-profile" as const,
      formatVersion: 1 as const,
      profileSchemaVersion: 1,
      exportedAt: "2026-08-11T08:00:00.000Z",
      sourceProject: {
        name: "Atlas Industrie",
        countryCode: "MA" as const,
        standardCode: "ISO_9001" as const,
      },
      fields: [{ key: "project.name" as const, status: "ANSWERED" as const, value: "Atlas" }],
    };
    expect(portableProjectProfileSchema.parse(base)).not.toHaveProperty("organizationId");
    expect(
      portableProjectProfileSchema.safeParse({
        ...base,
        fields: [...base.fields, ...base.fields],
      }).success,
    ).toBe(false);
    expect(portableProjectProfileSchema.safeParse({ ...base, formatVersion: 2 }).success).toBe(
      false,
    );
  });

  it("contains the routes consumed by the typed client when OpenAPI has been generated", async () => {
    try {
      await access(openApiPath, constants.R_OK);
    } catch {
      return;
    }
    const document = JSON.parse(await readFile(openApiPath, "utf8")) as {
      paths: Record<string, unknown>;
    };
    expect(document.paths["/v1/sites"]).toBeDefined();
    expect(document.paths["/v1/normative/search"]).toBeDefined();
    expect(document.paths["/v1/projects/{projectIdOrSlug}/profile/export.json"]).toBeDefined();
    expect(document.paths["/v1/projects/{projectIdOrSlug}/profile/import"]).toBeDefined();
  });
});
