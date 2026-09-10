import { Button } from "@qhse/ui/components/button";
import { Card, CardContent, CardHeader } from "@qhse/ui/components/card";
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
import { ActivityIcon, Building2Icon, FolderKanbanIcon, SearchIcon, UsersIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { adminApi, formatDate } from "../../lib/admin-api.js";
import type { OrganizationSummary, PageInfo } from "./organization-types.js";
import { formatNumber, initials, Metric, StatusBadge } from "./organization-ui.js";

type Response = {
  items: OrganizationSummary[];
  pagination: PageInfo;
  filters: { countries: string[] };
};

export function OrganizationsPage() {
  const [result, setResult] = useState<Response | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (search) query.set("search", search);
    if (status) query.set("status", status);
    if (countryCode) query.set("countryCode", countryCode);
    try {
      setError(null);
      setResult(await adminApi<Response>(`/v1/organizations?${query}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load organizations");
    }
  }, [countryCode, page, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => setPage(1), [search, status, countryCode]);

  const totals = result?.items.reduce(
    (sum, item) => ({
      members: sum.members + item._count.members,
      projects: sum.projects + item._count.projects,
      invocations: sum.invocations + item._count.aiInvocations,
    }),
    { members: 0, projects: 0, invocations: 0 },
  );

  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-6">
      <header>
        <p className="text-sm font-medium text-violet-700">Customer workspace</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Organizations</h1>
        <p className="mt-2 text-sm text-slate-600">
          Inspect customer organizations, their projects, memberships and AI activity.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Building2Icon}
          label="Organizations"
          value={result ? formatNumber(result.pagination.total) : "—"}
        />
        <Metric
          icon={FolderKanbanIcon}
          label="Projects on page"
          value={result ? formatNumber(totals?.projects ?? 0) : "—"}
        />
        <Metric
          icon={UsersIcon}
          label="Members on page"
          value={result ? formatNumber(totals?.members ?? 0) : "—"}
        />
        <Metric
          icon={ActivityIcon}
          label="AI calls on page"
          value={result ? formatNumber(totals?.invocations ?? 0) : "—"}
        />
      </div>

      {error ? (
        <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : null}

      <Card className="overflow-hidden rounded-3xl border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 p-5 sm:p-6">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-64 flex-1">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9"
                placeholder="Search organization or slug"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <NativeSelect
              aria-label="Organization status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <NativeSelectOption value="">All statuses</NativeSelectOption>
              <NativeSelectOption value="active">Active</NativeSelectOption>
              <NativeSelectOption value="suspended">Suspended</NativeSelectOption>
            </NativeSelect>
            <NativeSelect
              aria-label="Organization country"
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)}
            >
              <NativeSelectOption value="">All countries</NativeSelectOption>
              {result?.filters.countries.map((country) => (
                <NativeSelectOption key={country} value={country}>
                  {country}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!result ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3].map((key) => (
                <Skeleton key={key} className="h-16" />
              ))}
            </div>
          ) : result.items.length === 0 ? (
            <div className="grid place-items-center px-6 py-16 text-center">
              <Building2Icon className="size-8 text-slate-400" />
              <p className="mt-3 font-medium">No organization matches these filters</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Projects</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>AI calls</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((organization) => (
                  <TableRow key={organization.id} className="hover:bg-violet-50/40">
                    <TableCell>
                      <Link
                        className="flex items-center gap-3"
                        to={`/organizations/${organization.id}`}
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-xs font-semibold text-violet-700">
                          {initials(organization.name)}
                        </span>
                        <span>
                          <span className="block font-medium text-slate-950 hover:text-violet-700">
                            {organization.name}
                          </span>
                          <span className="block text-xs text-slate-500">{organization.slug}</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={organization.status} />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{organization.countryCode}</span>
                      <span className="block text-xs text-slate-500">{organization.timezone}</span>
                    </TableCell>
                    <TableCell>{formatNumber(organization._count.projects)}</TableCell>
                    <TableCell>{formatNumber(organization._count.members)}</TableCell>
                    <TableCell>{formatNumber(organization._count.aiInvocations)}</TableCell>
                    <TableCell className="text-slate-600">
                      {formatDate(organization.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {result && result.pagination.pageCount > 1 ? (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {result.pagination.page} of {result.pagination.pageCount} ·{" "}
            {result.pagination.total} organizations
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={page >= result.pagination.pageCount}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
