import { Button } from "@qhse/ui/components/button";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAdminAuth } from "./auth.js";

function destinationFromState(state: unknown): string {
  if (typeof state !== "object" || state === null || !("from" in state)) return "/";
  if (typeof state.from !== "string") return "/";
  return state.from.startsWith("/") && !state.from.startsWith("//") ? state.from : "/";
}

export function LoginPage() {
  const { login } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const loginError = await login(email, password);
      if (loginError) {
        setError(loginError);
        setIsSubmitting(false);
        return;
      }
      const destination = destinationFromState(location.state as unknown);
      await navigate(destination, { replace: true });
    } catch {
      setError("Unable to reach the administration API.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-6">
      <form
        className="w-full max-w-md space-y-5 rounded-xl bg-card p-8 shadow"
        onSubmit={(event) => void submit(event)}
      >
        <h1 className="text-2xl font-semibold">QHSE Administration</h1>
        <label className="block space-y-1">
          <span>Email</span>
          <input
            className="w-full rounded border px-3 py-2"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span>Password</span>
          <input
            className="w-full rounded border px-3 py-2"
            type="password"
            autoComplete="current-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <Button className="w-full" disabled={isSubmitting} type="submit">
          Sign in
        </Button>
      </form>
    </main>
  );
}
