import type { PropsWithChildren } from "react";
import { Button } from "@qhse/ui/components/button";
import { LoaderCircleIcon, RefreshCwIcon, ShieldCheckIcon, WifiOffIcon } from "lucide-react";
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
    <main
      className="grid min-h-screen place-items-center bg-[#080c16] p-6 text-white"
      role="status"
    >
      <div className="flex flex-col items-center text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-violet-600 shadow-lg shadow-violet-950/40">
          <ShieldCheckIcon className="size-6" />
        </span>
        <LoaderCircleIcon className="mt-6 size-5 animate-spin text-violet-300" />
        <p className="mt-3 text-sm text-slate-400">Checking your secure session…</p>
      </div>
    </main>
  );
}

function SessionFailure({ retry }: { retry: () => Promise<void> }) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#080c16] p-6 text-white">
      <div className="absolute size-80 rounded-full bg-violet-600/20 blur-3xl" />
      <section className="relative max-w-md rounded-3xl border border-white/10 bg-white/[0.05] p-8 text-center shadow-2xl backdrop-blur sm:p-10">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-400/10 text-amber-300">
          <WifiOffIcon className="size-7" />
        </span>
        <div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            Unable to verify your session
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Check that the administration API is running.
          </p>
        </div>
        <Button
          className="mt-6 rounded-xl bg-violet-600 text-white hover:bg-violet-500"
          onClick={() => void retry()}
        >
          <RefreshCwIcon className="size-4" /> Try again
        </Button>
      </section>
    </main>
  );
}
