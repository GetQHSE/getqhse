import type { PropsWithChildren } from "react";
import { Button } from "@qhse/ui/components/button";
import { Navigate, useLocation } from "react-router-dom";

import { canAccessAdmin, useAdminAuth } from "./auth.js";

export function AdminRoute({ children }: PropsWithChildren) {
  const { user, isPending, sessionError, refreshSession } = useAdminAuth();
  const location = useLocation();
  if (isPending) return <SessionLoading />;
  if (sessionError && !user) return <SessionFailure retry={refreshSession} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.status !== "active" || !canAccessAdmin(user.platformRole)) {
    return <Navigate to="/forbidden" replace />;
  }
  return children;
}

export function GuestRoute({ children }: PropsWithChildren) {
  const { user, isPending, sessionError, refreshSession } = useAdminAuth();
  if (isPending) return <SessionLoading />;
  if (sessionError && !user) return <SessionFailure retry={refreshSession} />;
  if (user) {
    return (
      <Navigate
        to={user.status === "active" && canAccessAdmin(user.platformRole) ? "/" : "/forbidden"}
        replace
      />
    );
  }
  return children;
}

function SessionLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-6" role="status">
      <p className="text-sm text-muted-foreground">Checking your session…</p>
    </main>
  );
}

function SessionFailure({ retry }: { retry: () => Promise<void> }) {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-6">
      <section className="space-y-4 text-center">
        <div>
          <h1 className="text-xl font-semibold">Unable to verify your session</h1>
          <p className="text-sm text-muted-foreground">
            Check that the administration API is running.
          </p>
        </div>
        <Button onClick={() => void retry()}>Try again</Button>
      </section>
    </main>
  );
}
