export type PageInfo = { total: number; page: number; pageSize: number; pageCount: number };

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  status: string;
  locale: string;
  timezone: string;
  createdAt: string;
  _count: { members: number; projects: number; aiInvocations: number };
};

export type OrganizationDetail = OrganizationSummary & {
  icon: string | null;
  _count: OrganizationSummary["_count"] & { invitations: number; sites: number };
};

export type OrganizationMember = {
  id: string;
  role: string;
  status: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    status: string;
    locale: string;
    timezone: string;
    createdAt: string;
  };
};

export type ProjectSummary = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  entityType: string;
  countryCode: string;
  standardCode: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  createdBy: { id: string; name: string; email: string };
  profile: {
    status: string;
    completenessPercent: number;
    regulatoryReadiness: number;
  } | null;
  regulatoryWatch: { status: string; lastSuccessfulSyncAt: string | null } | null;
  _count: { activities: number; aiInvocations: number };
};

export type ProjectDetail = Omit<ProjectSummary, "profile" | "regulatoryWatch" | "_count"> & {
  organization: { id: string; name: string; slug: string };
  activities: Array<{ id: string; name: string; isPrimary: boolean }>;
  profile:
    | (NonNullable<ProjectSummary["profile"]> & {
        revision: number;
        completedAt: string | null;
        lastReviewedAt: string | null;
        nextReviewAt: string | null;
        updatedAt: string;
      })
    | null;
  regulatoryWatch: {
    status: string;
    revision: number;
    lastCheckedAt: string | null;
    lastSuccessfulSyncAt: string | null;
    _count: { analyses: number; baselines: number };
  } | null;
  _count: { aiInvocations: number };
};

export type AiUsage = {
  period: "7d" | "30d" | "90d" | "all";
  since: string | null;
  totals: {
    invocations: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    costMicroUsd: number;
    averageLatencyMs: number;
    regulatoryRuns: number;
  };
  models: Array<{
    provider: string;
    model: string;
    invocations: number;
    inputTokens: number;
    outputTokens: number;
    averageLatencyMs: number;
  }>;
  modules: Array<{
    module: string;
    task: string;
    invocations: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  statuses: Array<{ status: string; count: number }>;
  recent: Array<{
    id: string;
    provider: string;
    model: string;
    module: string;
    task: string;
    status: string;
    inputTokens: number | null;
    outputTokens: number | null;
    latencyMs: number | null;
    createdAt: string;
    project: { id: string; name: string } | null;
  }>;
};
