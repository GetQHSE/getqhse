import { Button } from "@qhse/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { authClient } from "../../app/auth.js";

export function AcceptInvitationPage() {
  const { invitationId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function accept() {
    if (!invitationId) return;
    setIsSubmitting(true);
    setError(null);
    const result = await authClient.organization.acceptInvitation({ invitationId });
    if (result.error) {
      setError("Cette invitation est invalide ou a expiré.");
      setIsSubmitting(false);
      return;
    }
    if (result.data?.member.organizationId) {
      await authClient.organization.setActive({
        organizationId: result.data.member.organizationId,
      });
    }
    await queryClient.invalidateQueries({ queryKey: ["auth", "organizations"] });
    await navigate("/");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <section className="w-full max-w-md space-y-5 rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Invitation à une organisation</h1>
        <p>Acceptez l’invitation pour rejoindre votre espace QHSE.</p>
        {error && <p role="alert">{error}</p>}
        <Button disabled={!invitationId || isSubmitting} onClick={() => void accept()}>
          Accepter l’invitation
        </Button>
      </section>
    </main>
  );
}
