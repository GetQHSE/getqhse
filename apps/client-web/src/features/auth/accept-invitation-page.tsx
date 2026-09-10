import { Button } from "@qhse/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogInIcon, UserPlusIcon } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { authClient, useAuth } from "../../app/auth.js";
import { clientApi } from "../../app/client-api.js";

const roleLabels = { owner: "propriétaire", admin: "administrateur", member: "membre" } as const;

export function AcceptInvitationPage() {
  const { invitationId } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const preview = useQuery({
    queryKey: ["invitation-preview", invitationId],
    queryFn: () => clientApi.invitationPreview(invitationId!),
    enabled: Boolean(invitationId),
    retry: false,
  });

  async function accept() {
    if (!invitationId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await authClient.organization.acceptInvitation({ invitationId });
      if (result.error) {
        setError(
          result.error.status === 403
            ? "Connectez-vous avec l’adresse e-mail qui a reçu cette invitation."
            : "Cette invitation est invalide, a expiré ou a déjà été utilisée.",
        );
        return;
      }
      const organizationId = result.data?.member.organizationId;
      if (organizationId) {
        const active = await authClient.organization.setActive({ organizationId });
        if (active.error) throw new Error(active.error.message);
      }
      await queryClient.invalidateQueries();
      await navigate("/", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Invitation impossible à accepter.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <section className="w-full max-w-lg space-y-5 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div>
          <p className="text-sm font-medium text-violet-700">Invitation à une organisation</p>
          <h1 className="mt-1 text-2xl font-semibold">
            {preview.data
              ? `Rejoindre ${preview.data.organizationName}`
              : "Chargement de l’invitation…"}
          </h1>
        </div>
        {preview.data ? (
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
            <p>
              <strong>{preview.data.inviterName}</strong> vous invite comme{" "}
              {roleLabels[preview.data.role]}.
            </p>
            <p className="mt-2">Destinataire : {preview.data.recipientEmailMasked}</p>
            <p>Expiration : {new Date(preview.data.expiresAt).toLocaleString()}</p>
          </div>
        ) : null}
        {preview.data?.status && preview.data.status !== "pending" ? (
          <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Cette invitation est {preview.data.status === "expired" ? "expirée" : "indisponible"}.
          </p>
        ) : null}
        {preview.isError ? (
          <p role="alert" className="text-sm text-red-700">
            Invitation introuvable.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {!user && preview.data?.status === "pending" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button render={<Link to="/login" state={{ from: location.pathname }} />}>
              <LogInIcon /> Se connecter
            </Button>
            <Button
              variant="outline"
              render={<Link to="/sign-up" state={{ from: location.pathname }} />}
            >
              <UserPlusIcon /> Créer un compte
            </Button>
          </div>
        ) : null}
        {user && preview.data?.status === "pending" ? (
          <Button
            className="w-full"
            disabled={!invitationId || isSubmitting}
            onClick={() => void accept()}
          >
            {isSubmitting ? "Acceptation…" : "Accepter et rejoindre"}
          </Button>
        ) : null}
      </section>
    </main>
  );
}
