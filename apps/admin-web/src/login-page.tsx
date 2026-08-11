import { Button } from "@qhse/ui/components/button";
import { Input } from "@qhse/ui/components/input";
import { BrandLogo } from "@qhse/ui/components/brand-logo";
import { ArrowRightIcon, CheckCircle2Icon, DatabaseZapIcon, SparklesIcon } from "lucide-react";
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
    <main className="min-h-screen bg-[#f7f7f9] text-slate-950 lg:grid lg:grid-cols-[minmax(28rem,0.9fr)_minmax(32rem,1.1fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#080c16] px-12 py-10 text-white lg:flex lg:flex-col">
        <div className="absolute -left-32 top-40 size-96 rounded-full bg-violet-600/25 blur-3xl" />
        <div className="absolute -right-24 bottom-10 size-80 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative">
          <BrandLogo
            variant="dark-background"
            label="GetQHSE"
            className="h-11 w-auto max-w-52 object-contain object-left"
          />
          <div>
            <p className="text-xs text-slate-400">Platform administration</p>
          </div>
        </div>
        <div className="relative my-auto max-w-lg py-12">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1.5 text-xs font-medium text-violet-200">
            <SparklesIcon className="size-3.5" /> Controlled knowledge operations
          </span>
          <h2 className="mt-7 text-4xl font-semibold leading-[1.12] tracking-tight xl:text-5xl">
            Trusted sources for every QHSE workflow.
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-slate-400">
            Operate the normative corpus, validate immutable revisions and monitor processing from
            one secure workspace.
          </p>
          <ul className="mt-8 space-y-4 text-sm text-slate-300">
            {[
              "Human-controlled publication",
              "Traceable document revisions",
              "Secure AI-ready sources",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <CheckCircle2Icon className="size-5 text-emerald-400" /> {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative flex items-center gap-2 text-xs text-slate-500">
          <DatabaseZapIcon className="size-4" /> Restricted to authorized platform operators
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <BrandLogo
              variant="light-background"
              label="GetQHSE"
              className="h-10 w-auto max-w-48 object-contain object-left"
            />
            <span className="mt-1 block text-xs font-medium text-slate-500">Administration</span>
          </div>
          <p className="text-sm font-semibold text-violet-700">Secure operator access</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sign in to administration</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Manage the documents and processing pipelines used across the platform.
          </p>
          <form className="mt-8 w-full space-y-5" onSubmit={(event) => void submit(event)}>
            <label className="block space-y-2 text-sm font-medium">
              <span>Email address</span>
              <Input
                className="h-11 w-full rounded-xl bg-white"
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Password</span>
              <Input
                className="h-11 w-full rounded-xl bg-white"
                type="password"
                autoComplete="current-password"
                placeholder="8 characters minimum"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? (
              <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              className="mt-3 h-11 w-full rounded-xl bg-violet-600 text-white hover:bg-violet-700"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
              {!isSubmitting ? <ArrowRightIcon className="size-4" /> : null}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
