import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { authClient } from "../../app/auth.js";
import { clientApi } from "../../app/client-api.js";
import { currentLanguage } from "../../app/i18n.js";
import { Login, type LoginFormValues } from "../../components/login.js";

function destinationFromState(state: unknown): string {
  if (typeof state !== "object" || state === null || !("from" in state)) return "/";
  return typeof state.from === "string" ? state.from : "/";
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isSignUp = location.pathname === "/sign-up";
  const { t } = useTranslation("auth");
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(input: LoginFormValues) {
    setError(undefined);
    setIsSubmitting(true);
    try {
      const result = isSignUp
        ? await authClient.signUp.email({
            email: input.email,
            password: input.password,
            name: input.name || input.email,
          })
        : await authClient.signIn.email({ email: input.email, password: input.password });
      if (result.error) {
        setError(isSignUp ? t("signUpFailed") : t("invalidCredentials"));
        return;
      }
      // A new account starts in the language chosen on the sign-up screen.
      if (isSignUp) {
        await clientApi.updatePreferences({ locale: currentLanguage() }).catch(() => undefined);
      }
      const destination = destinationFromState(location.state);
      await navigate(isSignUp && destination === "/" ? "/onboarding/organization" : destination, {
        replace: true,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Login
      error={error}
      isSubmitting={isSubmitting}
      mode={isSignUp ? "sign-up" : "login"}
      alternateState={location.state as unknown}
      onSubmit={submit}
    />
  );
}
