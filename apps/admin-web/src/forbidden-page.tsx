import { Button } from "@qhse/ui/components/button";
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
    <main className="grid min-h-screen place-items-center bg-muted/30 p-6">
      <section className="max-w-md space-y-4 text-center">
        <div>
          <h1 className="text-2xl font-semibold">403 Forbidden</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {user?.status !== "active"
              ? "This account is not active."
              : "Your account does not have an allowed platform role."}
          </p>
        </div>
        {user ? (
          <div className="space-y-2">
            <Button disabled={isSigningOut} variant="outline" onClick={() => void signOut()}>
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
