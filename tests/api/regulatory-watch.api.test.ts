import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ServerAuthError } from "@qhse/auth";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthenticationPort } from "../../apps/client-api/src/modules/auth/application/auth.port.js";
import { TenantContextGuard } from "../../apps/client-api/src/modules/auth/authorization/tenant-context.guard.js";
import { RegulatoryWatchService } from "../../apps/client-api/src/modules/regulatory-watch/application/regulatory-watch.service.js";
import { RegulatoryWatchController } from "../../apps/client-api/src/modules/regulatory-watch/presentation/regulatory-watch.controller.js";

describe("regulatory watch API", () => {
  let app: INestApplication;
  const tenant = { organizationId: "org-1", userId: "user-1", role: "owner" };
  const authentication = { requireAuth: vi.fn(), requireOrganization: vi.fn() };
  const regulatory = {
    get: vi.fn(),
    startAnalysis: vi.fn(),
    answerClarifications: vi.fn(),
    decideCandidate: vi.fn(),
    publish: vi.fn(),
    updateEvaluation: vi.fn(),
    addEvidence: vi.fn(),
    addAction: vi.fn(),
    updateAction: vi.fn(),
    exportWorkbook: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    authentication.requireAuth.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    authentication.requireOrganization.mockResolvedValue(tenant);
    const module = await Test.createTestingModule({
      controllers: [RegulatoryWatchController],
      providers: [
        TenantContextGuard,
        { provide: AuthenticationPort, useValue: authentication },
        { provide: RegulatoryWatchService, useValue: regulatory },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => app.close());

  it("protects the project regulatory register", async () => {
    authentication.requireAuth.mockRejectedValue(
      new ServerAuthError(401, "Authentication required"),
    );
    await request(app.getHttpServer()).get("/v1/projects/project-1/regulatory-watch").expect(401);
    expect(regulatory.get).not.toHaveBeenCalled();
  });

  it("starts a tenant-scoped analysis with validated filters", async () => {
    regulatory.startAnalysis.mockResolvedValue({
      runId: "run-1",
      status: "QUEUED",
      jobId: "job-1",
    });
    await request(app.getHttpServer())
      .post("/v1/projects/project-1/regulatory-watch/analysis-runs")
      .send({ asOf: "2026-08-10", languages: ["fr", "ar"] })
      .expect(201)
      .expect({ runId: "run-1", status: "QUEUED", jobId: "job-1" });
    expect(regulatory.startAnalysis).toHaveBeenCalledWith(
      tenant,
      "project-1",
      expect.objectContaining({ languages: ["fr", "ar"] }),
    );
    await request(app.getHttpServer())
      .post("/v1/projects/project-1/regulatory-watch/analysis-runs")
      .send({ languages: ["en"] })
      .expect(400);
  });

  it("validates human decisions and exposes the exact XLSX media type", async () => {
    regulatory.decideCandidate.mockResolvedValue({ id: "watch-1", revision: 3 });
    await request(app.getHttpServer())
      .patch("/v1/projects/project-1/regulatory-watch/candidates/candidate-1")
      .send({
        watchRevision: 2,
        decision: "APPLICABLE",
        requirementText:
          "L’organisation doit appliquer et suivre cette exigence réglementaire validée.",
      })
      .expect(200);
    expect(regulatory.decideCandidate).toHaveBeenCalledWith(tenant, "project-1", "candidate-1", {
      watchRevision: 2,
      decision: "APPLICABLE",
      requirementText:
        "L’organisation doit appliquer et suivre cette exigence réglementaire validée.",
    });

    regulatory.exportWorkbook.mockResolvedValue(Buffer.from("xlsx"));
    await request(app.getHttpServer())
      .get("/v1/projects/project-1/regulatory-watch/export.xlsx")
      .expect(200)
      .expect(
        "content-type",
        /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
      )
      .expect("content-disposition", /veille-reglementaire\.xlsx/);
  });
});
