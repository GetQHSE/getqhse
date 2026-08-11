import { Button } from "@qhse/ui/components/button";
import { ArrowLeftIcon, ShieldXIcon } from "lucide-react";
import { useState } from "react";

import { useAdminAuth } from "./auth.js";

export function ForbiddenPage() {
  const { user, logout } = useAdminAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function signOut() {
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      await logout();
    } catch {
      setSignOutError("Unable to sign out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#080c16] p-6 text-white">
      <div className="absolute -left-24 top-1/3 size-80 rounded-full bg-violet-600/20 blur-3xl" />
      <section className="relative max-w-md rounded-3xl border border-white/10 bg-white/[0.05] p-8 text-center shadow-2xl backdrop-blur sm:p-10">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose-500/10 text-rose-300">
          <ShieldXIcon className="size-7" />
        </span>
        <div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">
            Access restricted
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">403 Forbidden</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            {user?.status !== "active"
              ? "This account is not active."
              : "Your account does not have an allowed platform role."}
          </p>
        </div>
        {user ? (
          <div className="space-y-2">
            <Button
              className="mt-3 rounded-xl border-white/15 bg-white/10 text-white hover:bg-white/15"
              disabled={isSigningOut}
              variant="outline"
              onClick={() => void signOut()}
            >
              <ArrowLeftIcon className="size-4" />
              {isSigningOut ? "Signing out…" : "Sign out and use another account"}
            </Button>
            {signOutError ? (
              <p className="text-sm text-destructive" role="alert">
                {signOutError}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
