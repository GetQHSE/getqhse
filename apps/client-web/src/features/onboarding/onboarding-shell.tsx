import type { PropsWithChildren, ReactNode } from "react";
import { CheckIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";
import { BrandLogo } from "@qhse/ui/components/brand-logo";

const steps = [
  { number: 1, label: "Votre compte" },
  { number: 2, label: "Votre organisation" },
  { number: 3, label: "Votre premier projet" },
];

export function OnboardingShell({
  currentStep,
  eyebrow,
  title,
  description,
  children,
  aside,
  finalStepLabel = "Votre premier projet",
}: PropsWithChildren<{
  currentStep: 1 | 2 | 3;
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
  finalStepLabel?: string;
}>) {
  const displayedSteps = steps.map((step) =>
    step.number === 3 ? { ...step, label: finalStepLabel } : step,
  );
  return (
    <main className="min-h-screen bg-[#f6f6f8] text-slate-950 lg:grid lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className="relative overflow-hidden bg-[#080c16] px-6 py-7 text-white lg:flex lg:min-h-screen lg:flex-col lg:px-8 lg:py-9">
        <div className="absolute -left-24 top-1/3 size-64 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute -right-32 bottom-10 size-72 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative">
          <BrandLogo
            variant="dark-background"
            label="GetQHSE"
            className="h-10 w-auto max-w-48 object-contain object-left"
          />
          <div>
            <p className="text-xs text-slate-400">Votre copilote conformité</p>
          </div>
        </div>

        <div className="relative mt-8 hidden lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
            Configuration
          </p>
          <h2 className="mt-3 text-2xl font-semibold leading-tight">
            Un espace clair pour piloter votre démarche QHSE.
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Nous préparons votre environnement afin que l’assistant adapte ses questions et ses
            recommandations à votre activité.
          </p>
        </div>

        <ol className="relative mt-7 hidden space-y-2 lg:block">
          {displayedSteps.map((step) => {
            const isDone = step.number < currentStep;
            const isCurrent = step.number === currentStep;
            return (
              <li
                key={step.number}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${
                  isCurrent ? "bg-white/10 text-white" : "text-slate-400"
                }`}
              >
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold ${
                    isDone
                      ? "border-emerald-400 bg-emerald-400 text-slate-950"
                      : isCurrent
                        ? "border-violet-400 bg-violet-500 text-white"
                        : "border-slate-700"
                  }`}
                >
                  {isDone ? <CheckIcon className="size-3.5" /> : step.number}
                </span>
                <span className={isCurrent ? "font-medium" : undefined}>{step.label}</span>
              </li>
            );
          })}
        </ol>

        <div className="relative mt-auto hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 lg:block">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheckIcon className="size-4 text-emerald-400" /> Données sécurisées
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Vos informations restent séparées par organisation et alimentent uniquement votre espace
            de travail.
          </p>
        </div>
      </aside>

      <section className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-4 py-8 sm:px-8 lg:min-h-screen lg:px-12 lg:py-12">
        <div className="w-full max-w-4xl">
          <div className="mb-7 flex items-center gap-2 text-sm font-medium text-violet-700">
            <SparklesIcon className="size-4" /> {eyebrow}
          </div>
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
              {description}
            </p>
          </div>
          <div className={`mt-8 grid gap-6 ${aside ? "xl:grid-cols-[minmax(0,1fr)_18rem]" : ""}`}>
            {children}
            {aside}
          </div>
        </div>
      </section>
    </main>
  );
}
