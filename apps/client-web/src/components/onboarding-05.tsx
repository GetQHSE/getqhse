import { cn } from "@qhse/ui/lib/utils";

export type OnboardingActivity = {
  id: string;
  description: string;
  user: { name: string; initial: string; bgColor: string };
  activityTime: string;
  type?: "created" | "in progress";
};

export function Onboarding05({
  title = "Activité du projet",
  description = "Résumé des informations qui seront créées",
  steps,
}: {
  title?: string;
  description?: string;
  steps: OnboardingActivity[];
}) {
  return (
    <aside className="rounded-xl border bg-background p-6">
      <h3 className="font-medium text-foreground">{title}</h3>
      <p className="mt-1 text-muted-foreground text-sm leading-6">{description}</p>
      <ul className="mt-6 space-y-6 pb-2">
        {steps.map((step, stepIdx) => (
          <li className="relative flex gap-x-3" key={step.id}>
            <div className={cn("absolute top-0 left-0 flex w-6 justify-center", stepIdx === steps.length - 1 ? "h-6" : "-bottom-6")}>
              <span aria-hidden className="w-px bg-border" />
            </div>
            <div className="flex items-start space-x-2">
              <div className="flex items-center space-x-2">
                <div className="relative flex size-6 flex-none items-center justify-center bg-background">
                  <div className={cn("size-3 rounded-full border border-gray-300 ring-4 ring-background", step.type === "in progress" ? "bg-background" : "bg-muted/50")} />
                </div>
                <span aria-hidden className={cn(step.user.bgColor, "inline-flex size-6 flex-none items-center justify-center rounded-full text-primary-foreground text-xs")}>
                  {step.user.initial}
                </span>
              </div>
              <p className="mt-0.5 font-medium text-foreground text-sm">
                {step.user.name}
                <span className="font-normal text-muted-foreground"> {step.description}</span>
                <span className="font-normal text-muted-foreground/60"> · {step.activityTime}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
