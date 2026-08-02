import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { authClient } from "../../app/auth.js";
import { Login, type LoginFormValues } from "../../components/login.js";

function destinationFromState(state: unknown): string {
  if (typeof state !== "object" || state === null || !("from" in state)) return "/";
  return typeof state.from === "string" ? state.from : "/";
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isSignUp = location.pathname === "/sign-up";
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
        setError(isSignUp ? "Inscription impossible" : "Identifiants invalides");
        return;
      }
      await navigate(isSignUp ? "/onboarding/organization" : destinationFromState(location.state), {
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
      onSubmit={submit}
    />
  );
}
