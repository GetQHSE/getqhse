import { Badge } from "@qhse/ui/components/badge";
import { Card, CardContent } from "@qhse/ui/components/card";
import type { LucideIcon } from "lucide-react";

export function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="flex items-center gap-4 p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-700">
          <Icon className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
          </span>
          <span className="mt-1 block truncate text-2xl font-semibold text-slate-950">{value}</span>
          {detail ? <span className="block truncate text-xs text-slate-500">{detail}</span> : null}
        </span>
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const positive = ["active", "completed", "complete", "ready_for_analysis"].includes(normalized);
  const negative = ["failed", "suspended", "archived", "blocking"].includes(normalized);
  return (
    <Badge
      className={
        positive
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : negative
            ? "border-rose-200 bg-rose-50 text-rose-800"
            : "border-amber-200 bg-amber-50 text-amber-800"
      }
    >
      {humanize(status)}
    </Badge>
  );
}

export function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 100_000 ? "compact" : "standard",
  }).format(value);
}
