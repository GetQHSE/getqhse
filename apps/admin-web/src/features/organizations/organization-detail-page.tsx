import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@qhse/ui/components/card";
import { Input } from "@qhse/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@qhse/ui/components/native-select";
import { Skeleton } from "@qhse/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@qhse/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@qhse/ui/components/tabs";
import {
  ActivityIcon,
  ArrowLeftIcon,
  Building2Icon,
  FolderKanbanIcon,
  MapPinIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { adminApi, formatDate } from "../../lib/admin-api.js";
import { AiUsagePanel } from "./ai-usage-panel.js";
import type {
  OrganizationDetail,
  OrganizationMember,
  PageInfo,
  ProjectSummary,
} from "./organization-types.js";
import { formatNumber, humanize, initials, Metric, StatusBadge } from "./organization-ui.js";

type ProjectResponse = { items: ProjectSummary[]; pagination: PageInfo };

export function OrganizationDetailPage() {
  const { organizationId = "" } = useParams();
  const [organization, setOrganization] = useState<OrganizationDetail | null>(null);
  const [members, setMembers] = useState<OrganizationMember[] | null>(null);
  const [projects, setProjects] = useState<ProjectResponse | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectStatus, setProjectStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    try {
      setError(null);
      setOrganization(await adminApi<OrganizationDetail>(`/v1/organizations/${organizationId}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load organization");
    }
  }, [organizationId]);

  const loadProjects = useCallback(async () => {
    const query = new URLSearchParams({ page: "1", pageSize: "100" });
    if (projectSearch) query.set("search", projectSearch);
    if (projectStatus) query.set("status", projectStatus);
    try {
      setProjects(
        await adminApi<ProjectResponse>(`/v1/organizations/${organizationId}/projects?${query}`),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load projects");
    }
  }, [organizationId, projectSearch, projectStatus]);

  useEffect(() => void loadDetail(), [loadDetail]);
  useEffect(() => {
    void adminApi<OrganizationMember[]>(`/v1/organizations/${organizationId}/members`)
      .then(setMembers)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unable to load members"),
      );
  }, [organizationId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadProjects(), 250);
    return () => window.clearTimeout(timer);
  }, [loadProjects]);

  if (!organization && !error)
    return (
      <div className="mx-auto max-w-[1440px] space-y-4">
        {[1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-28 rounded-2xl" />
        ))}
      </div>
    );

  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-6">
      <Link
        to="/organizations"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-violet-700"
      >
        <ArrowLeftIcon className="size-4" /> Organizations
      </Link>
      {error ? (
        <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void loadDetail()}>
            Retry
          </Button>
        </div>
      ) : null}
      {organization ? (
        <>
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="grid size-14 place-items-center rounded-2xl bg-violet-100 text-lg font-semibold text-violet-700">
                {initials(organization.name)}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-semibold tracking-tight">{organization.name}</h1>
                  <StatusBadge status={organization.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {organization.slug} · Created {formatDate(organization.createdAt)}
                </p>
              </div>
            </div>
          </header>

          <Tabs defaultValue="overview" className="space-y-5">
            <TabsList className="h-auto flex-wrap justify-start rounded-xl bg-slate-100 p-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="projects">Projects ({organization._count.projects})</TabsTrigger>
              <TabsTrigger value="members">Members ({organization._count.members})</TabsTrigger>
              <TabsTrigger value="ai">AI usage</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  icon={FolderKanbanIcon}
                  label="Projects"
                  value={formatNumber(organization._count.projects)}
                />
                <Metric
                  icon={UsersIcon}
                  label="Members"
                  value={formatNumber(organization._count.members)}
                  detail={`${organization._count.invitations} invitations`}
                />
                <Metric
                  icon={Building2Icon}
                  label="Sites"
                  value={formatNumber(organization._count.sites)}
                />
                <Metric
                  icon={ActivityIcon}
                  label="AI invocations"
                  value={formatNumber(organization._count.aiInvocations)}
                  detail="All time"
                />
              </div>
              <Card className="rounded-2xl border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Organization configuration</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <Detail label="Locale" value={organization.locale} />
                  <Detail label="Timezone" value={organization.timezone} />
                  <Detail label="Identifier" value={organization.id} mono />
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Workspace status</CardTitle>
                </CardHeader>
                <CardContent className="flex items-start gap-3 text-sm text-slate-600">
                  <MapPinIcon className="mt-0.5 size-4 text-violet-600" />
                  <span>
                    This organization uses{" "}
                    <strong className="text-slate-900">{organization.timezone}</strong> for
                    scheduling and deadline calculations. Countries are set per project.
                  </span>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="projects" className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <div className="relative min-w-64 flex-1">
                  <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="pl-9"
                    placeholder="Search projects"
                    value={projectSearch}
                    onChange={(event) => setProjectSearch(event.target.value)}
                  />
                </div>
                <NativeSelect
                  aria-label="Project status"
                  value={projectStatus}
                  onChange={(event) => setProjectStatus(event.target.value)}
                >
                  <NativeSelectOption value="">All statuses</NativeSelectOption>
                  {[
                    "EMPTY",
                    "PROFILE_IN_PROGRESS",
                    "PROFILE_REVIEW",
                    "READY_FOR_ANALYSIS",
                    "ANALYSIS_IN_PROGRESS",
                    "REVIEW_REQUIRED",
                    "COMPLETED",
                    "ARCHIVED",
                  ].map((status) => (
                    <NativeSelectOption key={status} value={status}>
                      {humanize(status)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
                <CardContent className="p-0">
                  {!projects ? (
                    <div className="space-y-3 p-6">
                      <Skeleton className="h-14" />
                      <Skeleton className="h-14" />
                    </div>
                  ) : projects.items.length === 0 ? (
                    <p className="p-12 text-center text-sm text-slate-500">
                      No project matches these filters.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Standard</TableHead>
                          <TableHead>Profile</TableHead>
                          <TableHead>AI calls</TableHead>
                          <TableHead>Updated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {projects.items.map((project) => (
                          <TableRow key={project.id} className="hover:bg-violet-50/40">
                            <TableCell>
                              <Link
                                className="font-medium text-slate-950 hover:text-violet-700"
                                to={`/organizations/${organizationId}/projects/${project.id}`}
                              >
                                {project.name}
                              </Link>
                              <span className="block text-xs text-slate-500">
                                {humanize(project.entityType)} · {project._count.activities}{" "}
                                activities
                              </span>
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={project.status} />
                            </TableCell>
                            <TableCell>{project.standardCode}</TableCell>
                            <TableCell>
                              {project.profile
                                ? `${project.profile.completenessPercent}%`
                                : "Not started"}
                            </TableCell>
                            <TableCell>{formatNumber(project._count.aiInvocations)}</TableCell>
                            <TableCell>{formatDate(project.updatedAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="members">
              <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
                <CardContent className="p-0">
                  {!members ? (
                    <div className="space-y-3 p-6">
                      <Skeleton className="h-14" />
                      <Skeleton className="h-14" />
                    </div>
                  ) : members.length === 0 ? (
                    <p className="p-12 text-center text-sm text-slate-500">
                      This organization has no members.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Member</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Membership</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead>Locale</TableHead>
                          <TableHead>Joined</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {members.map((member) => (
                          <TableRow key={member.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-xs font-semibold">
                                  {initials(member.user.name)}
                                </span>
                                <span>
                                  <span className="block font-medium">{member.user.name}</span>
                                  <span className="block text-xs text-slate-500">
                                    {member.user.email}
                                  </span>
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{humanize(member.role)}</Badge>
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={member.status} />
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={member.user.status} />
                            </TableCell>
                            <TableCell>{member.user.locale}</TableCell>
                            <TableCell>{formatDate(member.createdAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ai">
              <AiUsagePanel path={`/v1/organizations/${organizationId}/ai-usage`} />
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </section>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-1 truncate font-medium text-slate-950 ${mono ? "font-mono text-xs" : ""}`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}
