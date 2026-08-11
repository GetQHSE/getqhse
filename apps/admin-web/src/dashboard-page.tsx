import { Badge } from "@qhse/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@qhse/ui/components/card";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BookCheckIcon,
  FileUpIcon,
  FilesIcon,
  ScanTextIcon,
  SparklesIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi, formatDate } from "./lib/admin-api.js";

type Dashboard = {
  totals: Record<string, number>;
  queues: Record<string, number>;
  recentlyPublished: Array<{
    id: string;
    versionLabel: string;
    publishedAt: string;
    document: { id: string; title: string };
  }>;
};

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  useEffect(() => {
    void adminApi<Dashboard>("/v1/documents/dashboard").then(setData);
  }, []);
  const metrics = [
    ["Total documents", data?.totals["total"] ?? "—", FilesIcon, "bg-violet-50 text-violet-700"],
    [
      "Published",
      data?.totals["published"] ?? "—",
      BookCheckIcon,
      "bg-emerald-50 text-emerald-700",
    ],
    ["Processing", data?.totals["processing"] ?? "—", ScanTextIcon, "bg-blue-50 text-blue-700"],
    [
      "Failed jobs",
      data?.totals["failedJobs"] ?? "—",
      AlertTriangleIcon,
      "bg-rose-50 text-rose-700",
    ],
  ] as const;
  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-700">Knowledge operations</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Administration overview</h1>
          <p className="mt-2 text-sm text-slate-600">
            Review ingestion health and move trusted revisions through controlled publication.
          </p>
        </div>
        <Link
          to="/documents/upload"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          <FileUpIcon className="size-4" /> Upload document
        </Link>
      </header>

      <article className="relative overflow-hidden rounded-3xl bg-[#0a0e18] p-6 text-white shadow-sm sm:p-8">
        <div className="absolute -right-20 -top-24 size-80 rounded-full bg-violet-600/25 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 size-40 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1.5 text-xs font-medium text-violet-200">
              <SparklesIcon className="size-3.5" /> Normative knowledge base
            </span>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
              Keep every regulatory source traceable and ready for retrieval.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
              Upload, review and publish immutable revisions before they become available to the
              QHSE assistant and regulatory-watch workflows.
            </p>
          </div>
          <Link
            to="/documents"
            className="inline-flex h-10 w-fit shrink-0 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white transition hover:bg-violet-500"
          >
            Open document library <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </article>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, Icon, color]) => (
          <Card key={label} className="rounded-3xl border-slate-200 shadow-sm">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
              </div>
              <div className={`rounded-2xl p-3 ${color}`}>
                <Icon className="size-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card className="rounded-3xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Review queues</CardTitle>
            <p className="text-xs text-slate-500">Items that still require an administrator.</p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {Object.entries(data?.queues ?? {}).map(([queue, count]) => (
              <Link
                key={queue}
                to="/documents"
                className="group flex items-center justify-between rounded-2xl border border-slate-200 p-4 transition hover:border-violet-200 hover:bg-violet-50/40"
              >
                <span className="text-sm font-medium capitalize text-slate-700 group-hover:text-violet-900">
                  {queue.replace(/([A-Z])/g, " $1")}
                </span>
                <Badge variant={count > 0 ? "secondary" : "outline"}>{count}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Recently published</CardTitle>
            <p className="text-xs text-slate-500">Latest sources available to the platform.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {data?.recentlyPublished.length ? (
              data.recentlyPublished.map((version) => (
                <Link
                  key={version.id}
                  to={`/documents/${version.document.id}`}
                  className="group flex items-center justify-between gap-3 rounded-xl p-2.5 transition hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {version.document.title}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {version.versionLabel} · {formatDate(version.publishedAt)}
                    </span>
                  </span>
                  <ArrowRightIcon className="size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-600" />
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No revisions have been published yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
