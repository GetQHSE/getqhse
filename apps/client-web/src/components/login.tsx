import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@qhse/ui/components/button";
import { Field, FieldError, FieldLabel } from "@qhse/ui/components/field";
import { Input } from "@qhse/ui/components/input";
import { BrandLogo } from "@qhse/ui/components/brand-logo";
import { Controller, useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { ArrowRightIcon, CheckCircle2Icon, ShieldCheckIcon, SparklesIcon } from "lucide-react";

const formSchema = z.object({
  name: z.string().optional(),
  email: z.email("Adresse invalide"),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
});

export type LoginFormValues = z.infer<typeof formSchema>;

type LoginProps = {
  mode: "login" | "sign-up";
  isSubmitting?: boolean;
  error?: string | undefined;
  onSubmit: (values: LoginFormValues) => void | Promise<void>;
};

export function Login({ mode, isSubmitting = false, error, onSubmit }: LoginProps) {
  const isSignUp = mode === "sign-up";
  const form = useForm<LoginFormValues>({
    defaultValues: { email: "", name: "", password: "" },
    resolver: zodResolver(formSchema),
  });

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
            <p className="text-xs text-slate-400">Intelligence conformité</p>
          </div>
        </div>
        <div className="relative my-auto max-w-lg py-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1.5 text-xs font-medium text-violet-200">
            <SparklesIcon className="size-3.5" /> Conçu pour vos démarches ISO et réglementaires
          </div>
          <h2 className="mt-7 text-4xl font-semibold leading-[1.12] tracking-tight xl:text-5xl">
            La conformité devient un travail d’équipe, guidé par l’IA.
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-slate-400">
            Structurez le profil de vos projets, identifiez les exigences applicables et avancez
            avec des réponses sourcées.
          </p>
          <ul className="mt-8 space-y-4 text-sm text-slate-300">
            {[
              "Profil projet guidé",
              "Veille réglementaire contextualisée",
              "Réponses traçables et sécurisées",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <CheckCircle2Icon className="size-5 text-emerald-400" /> {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheckIcon className="size-4" /> Accès sécurisé et données isolées par organisation
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
          </div>
          <p className="text-sm font-semibold text-violet-700">
            {isSignUp ? "Commencez votre démarche" : "Heureux de vous revoir"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {isSignUp ? "Créez votre compte" : "Connectez-vous à votre espace"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {isSignUp
              ? "Quelques minutes suffisent pour configurer votre organisation et votre premier projet."
              : "Retrouvez vos projets, votre profil et votre veille réglementaire."}
          </p>

          <form
            className="mt-8 w-full space-y-5"
            onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
          >
            {isSignUp && (
              <Controller
                control={form.control}
                name="name"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Nom complet</FieldLabel>
                    <Input
                      aria-invalid={fieldState.invalid}
                      autoComplete="name"
                      className="h-11 w-full bg-white"
                      placeholder="Prénom et nom"
                      {...field}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            )}
            <Controller
              control={form.control}
              name="email"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Adresse e-mail</FieldLabel>
                  <Input
                    aria-invalid={fieldState.invalid}
                    autoComplete="email"
                    className="h-11 w-full bg-white"
                    placeholder="nom@entreprise.com"
                    type="email"
                    {...field}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="password"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Mot de passe</FieldLabel>
                  <Input
                    aria-invalid={fieldState.invalid}
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    className="h-11 w-full bg-white"
                    placeholder="8 caractères minimum"
                    type="password"
                    {...field}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              className="mt-3 h-11 w-full bg-violet-600 hover:bg-violet-700"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Veuillez patienter…" : isSignUp ? "S’inscrire" : "Se connecter"}
              {!isSubmitting && <ArrowRightIcon className="size-4" />}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {isSignUp ? "Vous avez déjà un compte ? " : "Pas encore de compte ? "}
            <Link
              className="font-semibold text-violet-700 hover:text-violet-800"
              to={isSignUp ? "/login" : "/sign-up"}
            >
              {isSignUp ? "Se connecter" : "Créer un compte"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

export default Login;
