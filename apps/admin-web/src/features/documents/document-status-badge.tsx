import { Badge } from "@qhse/ui/components/badge";

export function DocumentStatusBadge({ status }: { status: string }) {
  const value = status.toLowerCase();
  const variant = value.includes("fail")
    ? "destructive"
    : value === "published" || value === "validated"
      ? "default"
      : value === "archived"
        ? "outline"
        : "secondary";
  return <Badge variant={variant}>{value.replaceAll("_", " ")}</Badge>;
}
