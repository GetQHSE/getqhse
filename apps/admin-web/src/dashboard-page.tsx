import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@qhse/ui/components/card";

import { useAdminAuth } from "./auth.js";

export function DashboardPage() {
  const { user, isRefetching } = useAdminAuth();

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Welcome back, {user?.firstName ?? user?.name}</CardTitle>
        <CardDescription>Internal normative-content management workspace.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Signed in as
          </p>
          <p className="mt-1 truncate text-sm font-medium">{user?.email}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Platform role
          </p>
          <p className="mt-1 text-sm font-medium capitalize">
            {user?.platformRole.replaceAll("_", " ")}
          </p>
        </div>
        {isRefetching ? (
          <p className="text-xs text-muted-foreground sm:col-span-2" role="status">
            Refreshing session…
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
