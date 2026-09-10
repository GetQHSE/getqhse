import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthService } from "../auth/auth.service.js";
import { OrganizationsService } from "./organizations.service.js";

describe("OrganizationsService", () => {
  const organization = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  };
  const member = { findMany: vi.fn() };
  const project = { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() };
  const aiInvocation = { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() };
  const regulatoryAnalysisRun = { count: vi.fn() };
  const regulatoryModelCall = { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() };
  const database = {
    organization,
    member,
    project,
    aiInvocation,
    regulatoryAnalysisRun,
    regulatoryModelCall,
  };
  const service = new OrganizationsService({ database } as unknown as AuthService);

  beforeEach(() => {
    vi.clearAllMocks();
    organization.findUnique.mockResolvedValue({ id: "org-1" });
    organization.findMany.mockResolvedValue([]);
    organization.count.mockResolvedValue(0);
    organization.groupBy.mockResolvedValue([]);
    project.count.mockResolvedValue(0);
    project.findMany.mockResolvedValue([]);
    regulatoryModelCall.aggregate.mockResolvedValue({
      _count: { _all: 0, latencyMs: 0 },
      _sum: {
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        costMicroUsd: null,
        latencyMs: null,
      },
    });
    regulatoryModelCall.groupBy.mockResolvedValue([]);
    regulatoryModelCall.findMany.mockResolvedValue([]);
  });

  it("searches and paginates the organization directory", async () => {
    await service.list({
      search: "Atlas",
      status: "active",
      countryCode: undefined,
      page: 2,
      pageSize: 25,
    });

    expect(organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "active",
          OR: expect.arrayContaining([{ name: { contains: "Atlas", mode: "insensitive" } }]),
        }),
        skip: 25,
        take: 25,
      }),
    );
  });

  it("always scopes a project detail to its parent organization", async () => {
    project.findFirst.mockResolvedValue({ id: "project-1" });

    await service.projectDetail("org-1", "project-1");

    expect(project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "project-1", organizationId: "org-1" } }),
    );
  });

  it("does not reveal a project belonging to another organization", async () => {
    project.findFirst.mockResolvedValue(null);

    await expect(service.projectDetail("org-1", "foreign-project")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("summarizes model usage without double-counting regulatory runs", async () => {
    aiInvocation.aggregate.mockResolvedValue({
      _count: { _all: 2, latencyMs: 2 },
      _sum: { inputTokens: 100, outputTokens: 30, latencyMs: 400 },
      _avg: { latencyMs: 200 },
    });
    aiInvocation.groupBy
      .mockResolvedValueOnce([
        {
          provider: "openai",
          model: "gpt-test",
          _count: { id: 2 },
          _sum: { inputTokens: 100, outputTokens: 30 },
          _avg: { latencyMs: 200 },
        },
      ])
      .mockResolvedValueOnce([
        {
          module: "profile",
          task: "assistant",
          _count: { id: 2 },
          _sum: { inputTokens: 100, outputTokens: 30 },
        },
      ])
      .mockResolvedValueOnce([{ status: "COMPLETED", _count: { _all: 2 } }]);
    aiInvocation.findMany.mockResolvedValue([]);
    regulatoryAnalysisRun.count.mockResolvedValue(1);
    regulatoryModelCall.aggregate.mockResolvedValue({
      _count: { _all: 1, latencyMs: 1 },
      _sum: {
        inputTokens: 50,
        cachedInputTokens: 10,
        outputTokens: 20,
        reasoningTokens: 5,
        costMicroUsd: 1_500,
        latencyMs: 300,
      },
    });
    regulatoryModelCall.groupBy
      .mockResolvedValueOnce([
        {
          provider: "openai",
          model: "gpt-test",
          _count: { id: 1 },
          _sum: { inputTokens: 50, outputTokens: 20, latencyMs: 300 },
        },
      ])
      .mockResolvedValueOnce([
        {
          stage: "classification",
          _count: { id: 1 },
          _sum: { inputTokens: 50, outputTokens: 20 },
        },
      ])
      .mockResolvedValueOnce([{ status: "COMPLETED", _count: { _all: 1 } }]);

    const usage = await service.organizationAiUsage("org-1", { period: "all" });

    expect(usage.totals).toEqual({
      invocations: 3,
      inputTokens: 150,
      cachedInputTokens: 10,
      outputTokens: 50,
      reasoningTokens: 5,
      totalTokens: 200,
      costMicroUsd: 1_500,
      averageLatencyMs: 233,
      regulatoryRuns: 1,
    });
    expect(usage.models[0]).toEqual(
      expect.objectContaining({ provider: "openai", model: "gpt-test", invocations: 3 }),
    );
  });
});
