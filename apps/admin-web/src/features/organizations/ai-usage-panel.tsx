import { Badge } from "@qhse/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@qhse/ui/components/card";
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
import {
  ActivityIcon,
  BrainCircuitIcon,
  CircleDollarSignIcon,
  Clock3Icon,
  GaugeIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { adminApi, formatDate } from "../../lib/admin-api.js";
import type { AiUsage } from "./organization-types.js";
import { formatNumber, humanize, Metric, StatusBadge } from "./organization-ui.js";

export function AiUsagePanel({ path }: { path: string }) {
  const [period, setPeriod] = useState<AiUsage["period"]>("30d");
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      setUsage(await adminApi<AiUsage>(`${path}?period=${period}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load AI usage");
    }
  }, [path, period]);

  useEffect(() => void load(), [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">AI usage</h2>
          <p className="text-sm text-slate-500">
            Invocation volume, models, tokens and performance.
          </p>
        </div>
        <NativeSelect
          aria-label="AI usage period"
          value={period}
          onChange={(event) => setPeriod(event.target.value as AiUsage["period"])}
        >
          <NativeSelectOption value="7d">Last 7 days</NativeSelectOption>
          <NativeSelectOption value="30d">Last 30 days</NativeSelectOption>
          <NativeSelectOption value="90d">Last 90 days</NativeSelectOption>
          <NativeSelectOption value="all">All time</NativeSelectOption>
        </NativeSelect>
      </div>
      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      {!usage ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((key) => (
            <Skeleton key={key} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Metric
              icon={ActivityIcon}
              label="Invocations"
              value={formatNumber(usage.totals.invocations)}
            />
            <Metric
              icon={BrainCircuitIcon}
              label="Total tokens"
              value={formatNumber(usage.totals.totalTokens)}
              detail={`${formatNumber(usage.totals.inputTokens)} in · ${formatNumber(usage.totals.outputTokens)} out · ${formatNumber(usage.totals.reasoningTokens)} reasoning`}
            />
            <Metric
              icon={Clock3Icon}
              label="Average latency"
              value={`${formatNumber(usage.totals.averageLatencyMs)} ms`}
            />
            <Metric
              icon={GaugeIcon}
              label="Regulatory runs"
              value={formatNumber(usage.totals.regulatoryRuns)}
              detail="Analysis workflows"
            />
            <Metric
              icon={CircleDollarSignIcon}
              label="Tracked cost"
              value={formatUsd(usage.totals.costMicroUsd)}
              detail={`${formatNumber(usage.totals.cachedInputTokens)} cached input tokens`}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <UsageTable title="Models and providers" empty="No model usage in this period">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider / model</TableHead>
                    <TableHead>Calls</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>Latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.models.map((row) => (
                    <TableRow key={`${row.provider}:${row.model}`}>
                      <TableCell>
                        <span className="font-medium">{row.model}</span>
                        <span className="block text-xs text-slate-500">{row.provider}</span>
                      </TableCell>
                      <TableCell>{formatNumber(row.invocations)}</TableCell>
                      <TableCell>{formatNumber(row.inputTokens + row.outputTokens)}</TableCell>
                      <TableCell>{formatNumber(row.averageLatencyMs)} ms</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {usage.models.length === 0 ? <Empty text="No model usage in this period" /> : null}
            </UsageTable>

            <UsageTable title="Features and tasks" empty="No feature usage in this period">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead>Calls</TableHead>
                    <TableHead>Tokens</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.modules.map((row) => (
                    <TableRow key={`${row.module}:${row.task}`}>
                      <TableCell className="font-medium">{humanize(row.module)}</TableCell>
                      <TableCell>{humanize(row.task)}</TableCell>
                      <TableCell>{formatNumber(row.invocations)}</TableCell>
                      <TableCell>{formatNumber(row.inputTokens + row.outputTokens)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {usage.modules.length === 0 ? <Empty text="No feature usage in this period" /> : null}
            </UsageTable>
          </div>

          <UsageTable title="Recent invocations" empty="No recent invocations">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.recent.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="font-medium">{humanize(row.module)}</span>
                      <span className="block text-xs text-slate-500">{humanize(row.task)}</span>
                    </TableCell>
                    <TableCell>
                      <span>{row.model}</span>
                      <span className="block text-xs text-slate-500">{row.provider}</span>
                    </TableCell>
                    <TableCell>{row.project?.name ?? "Organization-wide"}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>
                      {formatNumber((row.inputTokens ?? 0) + (row.outputTokens ?? 0))}
                    </TableCell>
                    <TableCell>{formatDate(row.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {usage.recent.length === 0 ? <Empty text="No recent invocations" /> : null}
          </UsageTable>

          <div className="flex flex-wrap gap-2">
            {usage.statuses.map((status) => (
              <Badge key={status.status} variant="outline">
                {humanize(status.status)}: {formatNumber(status.count)}
              </Badge>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function UsageTable({
  title,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="p-6 text-center text-sm text-slate-500">{text}</p>;
}

function formatUsd(microUsd: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(microUsd / 1_000_000);
}
