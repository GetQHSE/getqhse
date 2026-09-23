import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@qhse/database";

import { AuthService } from "../auth/auth.service.js";
import type {
  AiUsageQuery,
  ListOrganizationProjectsInput,
  ListOrganizationsInput,
} from "./organizations.contracts.js";

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
  ) {}

  async list(input: ListOrganizationsInput) {
    const where: Prisma.OrganizationWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: "insensitive" } },
              { slug: { contains: input.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.auth.database.organization.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { name: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          logo: true,
          status: true,
          locale: true,
          timezone: true,
          createdAt: true,
          _count: { select: { members: true, projects: true, aiInvocations: true } },
        },
      }),
      this.auth.database.organization.count({ where }),
    ]);

    return {
      items,
      pagination: pageInfo(total, input.page, input.pageSize),
    };
  }

  async detail(organizationId: string) {
    const organization = await this.auth.database.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        icon: true,
        status: true,
        locale: true,
        timezone: true,
        createdAt: true,
        _count: {
          select: {
            members: true,
            invitations: true,
            projects: true,
            sites: true,
            aiInvocations: true,
          },
        },
      },
    });
    if (!organization) throw new NotFoundException("Organization not found");
    return organization;
  }

  async members(organizationId: string) {
    await this.assertOrganization(organizationId);
    return this.auth.database.member.findMany({
      where: { organizationId },
      orderBy: [{ status: "asc" }, { role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        role: true,
        status: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            status: true,
            locale: true,
            timezone: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async projects(organizationId: string, input: ListOrganizationProjectsInput) {
    await this.assertOrganization(organizationId);
    const where: Prisma.ProjectWhereInput = {
      organizationId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: "insensitive" } },
              { slug: { contains: input.search, mode: "insensitive" } },
              { standardCode: { contains: input.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.auth.database.project.findMany({
        where,
        orderBy: [{ archivedAt: "asc" }, { updatedAt: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          entityType: true,
          countryCode: true,
          standardCode: true,
          description: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          archivedAt: true,
          createdBy: { select: { id: true, name: true, email: true } },
          profile: {
            select: { status: true, completenessPercent: true, regulatoryReadiness: true },
          },
          regulatoryWatch: { select: { status: true, lastSuccessfulSyncAt: true } },
          _count: { select: { activities: true, aiInvocations: true } },
        },
      }),
      this.auth.database.project.count({ where }),
    ]);
    return { items, pagination: pageInfo(total, input.page, input.pageSize) };
  }

  async projectDetail(organizationId: string, projectId: string) {
    const project = await this.auth.database.project.findFirst({
      where: { id: projectId, organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        entityType: true,
        countryCode: true,
        standardCode: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        archivedAt: true,
        organization: { select: { id: true, name: true, slug: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        activities: {
          orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
          select: { id: true, name: true, isPrimary: true },
        },
        profile: {
          select: {
            status: true,
            completenessPercent: true,
            regulatoryReadiness: true,
            revision: true,
            completedAt: true,
            lastReviewedAt: true,
            nextReviewAt: true,
            updatedAt: true,
          },
        },
        regulatoryWatch: {
          select: {
            status: true,
            revision: true,
            lastCheckedAt: true,
            lastSuccessfulSyncAt: true,
            _count: { select: { analyses: true, baselines: true } },
          },
        },
        _count: { select: { aiInvocations: true } },
      },
    });
    if (!project) throw new NotFoundException("Project not found in this organization");
    return project;
  }

  async organizationAiUsage(organizationId: string, query: AiUsageQuery) {
    await this.assertOrganization(organizationId);
    return this.aiUsage({ organizationId }, query);
  }

  async projectAiUsage(organizationId: string, projectId: string, query: AiUsageQuery) {
    await this.assertProject(organizationId, projectId);
    return this.aiUsage({ organizationId, projectId }, query);
  }

  private async aiUsage(scope: Prisma.AiInvocationWhereInput, query: AiUsageQuery) {
    const since = periodStart(query.period);
    const where: Prisma.AiInvocationWhereInput = {
      ...scope,
      ...(since ? { createdAt: { gte: since } } : {}),
    };
    const regulatoryWhere: Prisma.RegulatoryModelCallWhereInput = {
      run: {
        watch: {
          organizationId: scope.organizationId as string,
          ...(scope.projectId ? { projectId: scope.projectId as string } : {}),
        },
      },
      ...(since ? { createdAt: { gte: since } } : {}),
    };
    const [
      totals,
      models,
      modules,
      statuses,
      recent,
      regulatoryRuns,
      regulatoryTotals,
      regulatoryModels,
      regulatoryStages,
      regulatoryStatuses,
      regulatoryRecent,
    ] = await Promise.all([
      this.auth.database.aiInvocation.aggregate({
        where,
        _count: { _all: true, latencyMs: true },
        _sum: { inputTokens: true, outputTokens: true, latencyMs: true },
        _avg: { latencyMs: true },
      }),
      this.auth.database.aiInvocation.groupBy({
        by: ["provider", "model"],
        where,
        orderBy: { _count: { id: "desc" } },
        _count: { id: true },
        _sum: { inputTokens: true, outputTokens: true },
        _avg: { latencyMs: true },
      }),
      this.auth.database.aiInvocation.groupBy({
        by: ["module", "task"],
        where,
        orderBy: { _count: { id: "desc" } },
        _count: { id: true },
        _sum: { inputTokens: true, outputTokens: true },
      }),
      this.auth.database.aiInvocation.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
      this.auth.database.aiInvocation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          provider: true,
          model: true,
          module: true,
          task: true,
          status: true,
          inputTokens: true,
          outputTokens: true,
          latencyMs: true,
          createdAt: true,
          project: { select: { id: true, name: true } },
        },
      }),
      this.auth.database.regulatoryAnalysisRun.count({
        where: {
          watch: {
            organizationId: scope.organizationId as string,
            ...(scope.projectId ? { projectId: scope.projectId as string } : {}),
          },
          ...(since ? { createdAt: { gte: since } } : {}),
        },
      }),
      this.auth.database.regulatoryModelCall.aggregate({
        where: regulatoryWhere,
        _count: { _all: true, latencyMs: true },
        _sum: {
          inputTokens: true,
          cachedInputTokens: true,
          outputTokens: true,
          reasoningTokens: true,
          costMicroUsd: true,
          latencyMs: true,
        },
      }),
      this.auth.database.regulatoryModelCall.groupBy({
        by: ["provider", "model"],
        where: regulatoryWhere,
        orderBy: { _count: { id: "desc" } },
        _count: { id: true },
        _sum: { inputTokens: true, outputTokens: true, latencyMs: true },
      }),
      this.auth.database.regulatoryModelCall.groupBy({
        by: ["stage"],
        where: regulatoryWhere,
        orderBy: { _count: { id: "desc" } },
        _count: { id: true },
        _sum: { inputTokens: true, outputTokens: true },
      }),
      this.auth.database.regulatoryModelCall.groupBy({
        by: ["status"],
        where: regulatoryWhere,
        _count: { _all: true },
      }),
      this.auth.database.regulatoryModelCall.findMany({
        where: regulatoryWhere,
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          provider: true,
          model: true,
          stage: true,
          status: true,
          inputTokens: true,
          outputTokens: true,
          latencyMs: true,
          createdAt: true,
          run: { select: { watch: { select: { project: { select: { id: true, name: true } } } } } },
        },
      }),
    ]);

    const inputTokens = (totals._sum.inputTokens ?? 0) + (regulatoryTotals._sum.inputTokens ?? 0);
    const outputTokens =
      (totals._sum.outputTokens ?? 0) + (regulatoryTotals._sum.outputTokens ?? 0);
    const latencyCount = totals._count.latencyMs + regulatoryTotals._count.latencyMs;
    const latencyTotal = (totals._sum.latencyMs ?? 0) + (regulatoryTotals._sum.latencyMs ?? 0);
    const normalizedModels = [
      ...models.map((row) => ({
        provider: row.provider,
        model: row.model,
        invocations: row._count.id,
        inputTokens: row._sum.inputTokens ?? 0,
        outputTokens: row._sum.outputTokens ?? 0,
        latencyMs: (row._avg.latencyMs ?? 0) * row._count.id,
      })),
      ...regulatoryModels.map((row) => ({
        provider: row.provider,
        model: row.model,
        invocations: row._count.id,
        inputTokens: row._sum.inputTokens ?? 0,
        outputTokens: row._sum.outputTokens ?? 0,
        latencyMs: row._sum.latencyMs ?? 0,
      })),
    ];
    return {
      period: query.period,
      since,
      totals: {
        invocations: totals._count._all + regulatoryTotals._count._all,
        inputTokens,
        cachedInputTokens: regulatoryTotals._sum.cachedInputTokens ?? 0,
        outputTokens,
        reasoningTokens: regulatoryTotals._sum.reasoningTokens ?? 0,
        // Cached tokens are part of input and reasoning tokens are part of output.
        totalTokens: inputTokens + outputTokens,
        costMicroUsd: regulatoryTotals._sum.costMicroUsd ?? 0,
        averageLatencyMs: latencyCount ? Math.round(latencyTotal / latencyCount) : 0,
        regulatoryRuns,
      },
      models: mergeModels(normalizedModels),
      modules: [
        ...modules.map((row) => ({
          module: row.module,
          task: row.task,
          invocations: row._count.id,
          inputTokens: row._sum.inputTokens ?? 0,
          outputTokens: row._sum.outputTokens ?? 0,
        })),
        ...regulatoryStages.map((row) => ({
          module: "regulatory-analysis",
          task: row.stage,
          invocations: row._count.id,
          inputTokens: row._sum.inputTokens ?? 0,
          outputTokens: row._sum.outputTokens ?? 0,
        })),
      ].sort((left, right) => right.invocations - left.invocations),
      statuses: mergeStatuses([
        ...statuses.map((row) => ({ status: row.status, count: row._count._all })),
        ...regulatoryStatuses.map((row) => ({ status: row.status, count: row._count._all })),
      ]),
      recent: [
        ...recent,
        ...regulatoryRecent.map((row) => ({
          id: `regulatory:${row.id}`,
          provider: row.provider,
          model: row.model,
          module: "regulatory-analysis",
          task: row.stage,
          status: row.status,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          latencyMs: row.latencyMs,
          createdAt: row.createdAt,
          project: row.run.watch.project,
        })),
      ]
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, 10),
    };
  }

  private async assertOrganization(organizationId: string) {
    const found = await this.auth.database.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException("Organization not found");
  }

  private async assertProject(organizationId: string, projectId: string) {
    const found = await this.auth.database.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException("Project not found in this organization");
  }
}

function pageInfo(total: number, page: number, pageSize: number) {
  return { total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

function periodStart(period: AiUsageQuery["period"]): Date | null {
  if (period === "all") return null;
  const days = Number.parseInt(period, 10);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function mergeModels(
  rows: Array<{
    provider: string;
    model: string;
    invocations: number;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
  }>,
) {
  const merged = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.provider}\u0000${row.model}`;
    const current = merged.get(key);
    merged.set(
      key,
      current
        ? {
            ...current,
            invocations: current.invocations + row.invocations,
            inputTokens: current.inputTokens + row.inputTokens,
            outputTokens: current.outputTokens + row.outputTokens,
            latencyMs: current.latencyMs + row.latencyMs,
          }
        : { ...row },
    );
  }
  return [...merged.values()]
    .map(({ latencyMs, ...row }) => ({
      ...row,
      averageLatencyMs: row.invocations ? Math.round(latencyMs / row.invocations) : 0,
    }))
    .sort((left, right) => right.invocations - left.invocations);
}

function mergeStatuses(rows: Array<{ status: string; count: number }>) {
  const merged = new Map<string, number>();
  for (const row of rows) merged.set(row.status, (merged.get(row.status) ?? 0) + row.count);
  return [...merged].map(([status, count]) => ({ status, count }));
}
