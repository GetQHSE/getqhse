import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@qhse/ui";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { authClient } from "../../app/auth.js";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});
type LoginInput = z.infer<typeof loginSchema>;

function destinationFromState(state: unknown): string {
  if (typeof state !== "object" || state === null || !("from" in state)) return "/";
  return typeof state.from === "string" ? state.from : "/";
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function submit(input: LoginInput) {
    const result = await authClient.signIn.email(input);
    if (result.error) {
      setError("root", { message: "Identifiants invalides" });
      return;
    }
    const destination = destinationFromState(location.state as unknown);
    await navigate(destination, { replace: true });
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <form
        className="w-full max-w-md space-y-5 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
        onSubmit={(event) => void handleSubmit(submit)(event)}
      >
        <h1 className="text-2xl font-semibold text-slate-900">{t("signIn")}</h1>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t("email")}</span>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            {...register("email")}
          />
          {errors.email && <span className="text-sm text-red-700">Adresse invalide</span>}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t("password")}</span>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            {...register("password")}
          />
        </label>
        {errors.root && (
          <p role="alert" className="text-sm text-red-700">
            {errors.root.message}
          </p>
        )}
        <Button className="w-full" disabled={isSubmitting} type="submit">
          {t("signIn")}
        </Button>
      </form>
    </main>
  );
}
