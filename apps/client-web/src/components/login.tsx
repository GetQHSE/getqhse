import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@qhse/ui/components/button";
import { Field, FieldError, FieldLabel } from "@qhse/ui/components/field";
import { Input } from "@qhse/ui/components/input";
import { BrandLogo } from "@qhse/ui/components/brand-logo";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { z } from "zod";
import { ArrowRightIcon, CheckCircle2Icon, ShieldCheckIcon, SparklesIcon } from "lucide-react";

import { LanguageSelect } from "./language-switcher.js";

function loginSchema(messages: { invalidEmail: string; passwordTooShort: string }) {
  return z.object({
    name: z.string().optional(),
    email: z.email(messages.invalidEmail),
    password: z.string().min(8, messages.passwordTooShort),
  });
}

export type LoginFormValues = z.infer<ReturnType<typeof loginSchema>>;

type LoginProps = {
  mode: "login" | "sign-up";
  isSubmitting?: boolean;
  error?: string | undefined;
  alternateState?: unknown;
  onSubmit: (values: LoginFormValues) => void | Promise<void>;
};

export function Login({ mode, isSubmitting = false, error, alternateState, onSubmit }: LoginProps) {
  const isSignUp = mode === "sign-up";
  const { t, i18n } = useTranslation("auth");
  const formSchema = useMemo(
    () => loginSchema({ invalidEmail: t("invalidEmail"), passwordTooShort: t("passwordTooShort") }),
    // Rebuilt on language change so validation messages follow the interface.
    [t, i18n.language],
  );
  const form = useForm<LoginFormValues>({
    defaultValues: { email: "", name: "", password: "" },
    resolver: zodResolver(formSchema),
  });

  return (
    <main className="min-h-screen bg-[#f7f7f9] text-slate-950 lg:grid lg:grid-cols-[minmax(28rem,0.9fr)_minmax(32rem,1.1fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#080c16] px-12 py-10 text-white lg:flex lg:flex-col">
        <div className="absolute -start-32 top-40 size-96 rounded-full bg-violet-600/25 blur-3xl" />
        <div className="absolute -end-24 bottom-10 size-80 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative">
          <BrandLogo
            variant="dark-background"
            label="GetQHSE"
            className="h-11 w-auto max-w-52 object-contain object-left rtl:object-right"
          />
          <div>
            <p className="text-xs text-slate-400">{t("tagline")}</p>
          </div>
        </div>
        <div className="relative my-auto max-w-lg py-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1.5 text-xs font-medium text-violet-200">
            <SparklesIcon className="size-3.5" /> {t("heroBadge")}
          </div>
          <h2 className="mt-7 text-4xl font-semibold leading-[1.12] tracking-tight xl:text-5xl">
            {t("heroTitle")}
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-slate-400">{t("heroBody")}</p>
          <ul className="mt-8 space-y-4 text-sm text-slate-300">
            {[t("heroPoints.profile"), t("heroPoints.watch"), t("heroPoints.traceable")].map(
              (item) => (
                <li key={item} className="flex items-center gap-3">
                  <CheckCircle2Icon className="size-5 text-emerald-400" /> {item}
                </li>
              ),
            )}
          </ul>
        </div>
        <div className="relative flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheckIcon className="size-4" /> {t("secureAccess")}
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-end">
            <LanguageSelect />
          </div>
          <div className="mb-10 lg:hidden">
            <BrandLogo
              variant="light-background"
              label="GetQHSE"
              className="h-10 w-auto max-w-48 object-contain object-left rtl:object-right"
            />
          </div>
          <p className="text-sm font-semibold text-violet-700">
            {isSignUp ? t("signUpEyebrow") : t("loginEyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {isSignUp ? t("signUpTitle") : t("loginTitle")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {isSignUp ? t("signUpBody") : t("loginBody")}
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
                    <FieldLabel>{t("fullName")}</FieldLabel>
                    <Input
                      aria-invalid={fieldState.invalid}
                      autoComplete="name"
                      className="h-11 w-full bg-white"
                      placeholder={t("fullNamePlaceholder")}
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
                  <FieldLabel>{t("email")}</FieldLabel>
                  <Input
                    aria-invalid={fieldState.invalid}
                    autoComplete="email"
                    className="h-11 w-full bg-white"
                    placeholder={t("emailPlaceholder")}
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
                  <FieldLabel>{t("password")}</FieldLabel>
                  <Input
                    aria-invalid={fieldState.invalid}
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    className="h-11 w-full bg-white"
                    placeholder={t("passwordPlaceholder")}
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
              {isSubmitting
                ? t("pleaseWait", { ns: "common" })
                : isSignUp
                  ? t("signUp")
                  : t("signIn")}
              {!isSubmitting && <ArrowRightIcon className="size-4 rtl:rotate-180" />}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {isSignUp ? t("haveAccount") : t("noAccount")}
            <Link
              className="font-semibold text-violet-700 hover:text-violet-800"
              to={isSignUp ? "/login" : "/sign-up"}
              state={alternateState}
            >
              {isSignUp ? t("signIn") : t("createAccount")}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

export default Login;
