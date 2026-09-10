import { Badge } from "@qhse/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@qhse/ui/components/card";
import { Skeleton } from "@qhse/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@qhse/ui/components/tabs";
import {
  ActivityIcon,
  ArrowLeftIcon,
  BrainCircuitIcon,
  ClipboardCheckIcon,
  ListChecksIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { adminApi, formatDate } from "../../lib/admin-api.js";
import { AiUsagePanel } from "./ai-usage-panel.js";
import type { ProjectDetail } from "./organization-types.js";
import { formatNumber, humanize, Metric, StatusBadge } from "./organization-ui.js";

export function ProjectDetailPage() {
  const { organizationId = "", projectId = "" } = useParams();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void adminApi<ProjectDetail>(`/v1/organizations/${organizationId}/projects/${projectId}`)
      .then(setProject)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unable to load project"),
      );
  }, [organizationId, projectId]);

  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-6">
      <Link
        to={`/organizations/${organizationId}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-violet-700"
      >
        <ArrowLeftIcon className="size-4" /> Organization
      </Link>
      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      {!project ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : (
        <>
          <header>
            <p className="text-sm font-medium text-violet-700">{project.organization.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
              <StatusBadge status={project.status} />
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {humanize(project.entityType)} · {project.standardCode} · {project.countryCode}
            </p>
          </header>
          <Tabs defaultValue="overview" className="space-y-5">
            <TabsList className="h-auto flex-wrap justify-start rounded-xl bg-slate-100 p-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="regulatory">Regulatory</TabsTrigger>
              <TabsTrigger value="ai">AI usage</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  icon={ListChecksIcon}
                  label="Activities"
                  value={project.activities.length}
                />
                <Metric
                  icon={ClipboardCheckIcon}
                  label="Profile completeness"
                  value={`${project.profile?.completenessPercent ?? 0}%`}
                />
                <Metric
                  icon={BrainCircuitIcon}
                  label="AI invocations"
                  value={formatNumber(project._count.aiInvocations)}
                  detail="All time"
                />
                <Metric
                  icon={ActivityIcon}
                  label="Regulatory analyses"
                  value={project.regulatoryWatch?._count.analyses ?? 0}
                />
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <Card className="rounded-2xl border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Project details</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                    <Detail label="Slug" value={project.slug} />
                    <Detail label="Standard" value={project.standardCode} />
                    <Detail label="Created by" value={project.createdBy.name} />
                    <Detail label="Created" value={formatDate(project.createdAt)} />
                    <Detail label="Updated" value={formatDate(project.updatedAt)} />
                    <Detail label="Project ID" value={project.id} mono />
                  </CardContent>
                </Card>
                <Card className="rounded-2xl border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Activities</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {project.activities.length ? (
                      project.activities.map((activity) => (
                        <Badge
                          key={activity.id}
                          variant={activity.isPrimary ? "default" : "outline"}
                        >
                          {activity.name}
                          {activity.isPrimary ? " · Primary" : ""}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">No activities configured.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
              {project.description ? (
                <Card className="rounded-2xl border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Description</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-6 text-slate-600">
                    {project.description}
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>
            <TabsContent value="profile">
              <Card className="rounded-2xl border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Organization profile</CardTitle>
                </CardHeader>
                <CardContent>
                  {project.profile ? (
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                      <Detail label="Status" value={humanize(project.profile.status)} />
                      <Detail
                        label="Completeness"
                        value={`${project.profile.completenessPercent}%`}
                      />
                      <Detail
                        label="Regulatory readiness"
                        value={`${project.profile.regulatoryReadiness}%`}
                      />
                      <Detail label="Revision" value={String(project.profile.revision)} />
                      <Detail
                        label="Last reviewed"
                        value={formatDate(project.profile.lastReviewedAt)}
                      />
                      <Detail
                        label="Next review"
                        value={formatDate(project.profile.nextReviewAt)}
                      />
                      <Detail label="Updated" value={formatDate(project.profile.updatedAt)} />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">The profile has not been started.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="regulatory">
              <Card className="rounded-2xl border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Regulatory watch</CardTitle>
                </CardHeader>
                <CardContent>
                  {project.regulatoryWatch ? (
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                      <Detail label="Status" value={humanize(project.regulatoryWatch.status)} />
                      <Detail label="Revision" value={String(project.regulatoryWatch.revision)} />
                      <Detail
                        label="Analyses"
                        value={String(project.regulatoryWatch._count.analyses)}
                      />
                      <Detail
                        label="Baselines"
                        value={String(project.regulatoryWatch._count.baselines)}
                      />
                      <Detail
                        label="Last checked"
                        value={formatDate(project.regulatoryWatch.lastCheckedAt)}
                      />
                      <Detail
                        label="Last successful sync"
                        value={formatDate(project.regulatoryWatch.lastSuccessfulSyncAt)}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Regulatory watch has not been configured.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="ai">
              <AiUsagePanel
                path={`/v1/organizations/${organizationId}/projects/${projectId}/ai-usage`}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </section>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-medium text-slate-950 ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </p>
    </div>
  );
}
