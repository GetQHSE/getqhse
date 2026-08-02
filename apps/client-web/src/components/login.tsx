import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@qhse/ui/components/button";
import { Field, FieldError, FieldLabel } from "@qhse/ui/components/field";
import { Input } from "@qhse/ui/components/input";
import { Controller, useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";

import { Logo } from "#components/logo";

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
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex min-h-screen w-full">
        <div className="relative m-auto flex w-full max-w-sm flex-col items-center p-8 outline-0 outline-border/40 outline-offset-0.5 sm:outline-2 dark:outline-border/80">
          <div className="absolute inset-x-0 top-0 w-[calc(100%+4rem)] -translate-x-8 border-t max-sm:hidden" />
          <div className="absolute inset-x-0 bottom-0 w-[calc(100%+4rem)] -translate-x-8 border-b max-sm:hidden" />
          <div className="absolute inset-y-0 left-0 h-[calc(100%+4rem)] -translate-y-8 border-s max-sm:hidden" />
          <div className="absolute inset-y-0 right-0 h-[calc(100%+4rem)] -translate-y-8 border-e max-sm:hidden" />
          <Logo className="h-9 w-9 text-teal-800" />
          <h1 className="mt-4 text-center font-medium text-xl">
            {isSignUp ? "Créer un compte QHSE" : "Connexion à QHSE Platform"}
          </h1>
          <p className="mt-2 text-center text-muted-foreground text-sm">
            {isSignUp
              ? "Démarrez votre espace QHSE en quelques étapes."
              : "Accédez à votre espace QHSE sécurisé."}
          </p>

          <form
            className="mt-8 w-full space-y-4"
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
                      className="w-full"
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
                    className="w-full"
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
                    className="w-full"
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
            <Button className="mt-4 w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Veuillez patienter…" : isSignUp ? "S’inscrire" : "Se connecter"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {isSignUp ? "Vous avez déjà un compte ? " : "Pas encore de compte ? "}
            <Link className="font-medium underline" to={isSignUp ? "/login" : "/sign-up"}>
              {isSignUp ? "Se connecter" : "Créer un compte"}
            </Link>
          </p>
        </div>
        <div className="relative hidden w-full max-w-2xl grow border-l bg-muted lg:block">
          <div className="absolute inset-0 bg-gradient-to-br from-teal-950 via-teal-800 to-emerald-700" />
          <div className="relative flex h-full flex-col justify-end p-10 text-white">
            <p className="text-3xl font-semibold">Pilotez votre conformité ISO 9001.</p>
            <p className="mt-3 max-w-md text-sm text-white/80">
              Centralisez organisations, projets, audits et actions QHSE sans modifier les flux
              d’authentification existants.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default Login;
