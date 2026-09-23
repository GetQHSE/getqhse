import type { OrganizationMemberSummary, OrganizationRoleContract } from "@qhse/contracts";
import { Button } from "@qhse/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@qhse/ui/components/card";
import { Input } from "@qhse/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MailPlusIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  Trash2Icon,
  UserRoundCheckIcon,
  UserRoundXIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { authClient, useAuth } from "../../app/auth.js";
import { clientApi } from "../../app/client-api.js";
import { useFormat } from "../../app/format.js";

function allowedRoles(currentRole: OrganizationRoleContract): OrganizationRoleContract[] {
  return currentRole === "owner" ? ["owner", "admin", "member"] : ["admin", "member"];
}

export function TeamPage() {
  const { activeOrganization, user } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation("workspace");
  const format = useFormat();
  const roleLabel = (value: OrganizationRoleContract) => t(`roles.${value}`, { ns: "common" });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationRoleContract>("member");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const team = useQuery({
    queryKey: ["organization-team", activeOrganization?.id],
    queryFn: clientApi.organizationTeam,
    enabled: Boolean(activeOrganization),
  });
  const currentRole = team.data?.currentMember.role ?? activeOrganization?.role ?? "member";
  const canManage = currentRole === "owner" || currentRole === "admin";

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: ["organization-team", activeOrganization?.id],
    });
  }

  const operation = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: async () => refresh(),
    onError: (reason) =>
      setError(reason instanceof Error ? reason.message : t("team.operationFailed")),
  });

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrganization) return;
    setError(null);
    setMessage(null);
    const result = await authClient.organization.inviteMember({
      email: email.trim().toLowerCase(),
      role,
      organizationId: activeOrganization.id,
    });
    if (result.error) {
      setError(result.error.message ?? t("team.inviteFailed"));
      return;
    }
    setEmail("");
    setRole("member");
    setMessage(t("team.invited"));
    await refresh();
  }

  function canManageMember(member: OrganizationMemberSummary) {
    if (!canManage || member.email === user?.email) return false;
    return currentRole === "owner" || member.role !== "owner";
  }

  function memberRow(member: OrganizationMemberSummary) {
    const manageable = canManageMember(member);
    return (
      <div key={member.id} className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {member.name}{" "}
            {member.email === user?.email ? (
              <span className="text-xs text-slate-500">{t("team.you")}</span>
            ) : null}
          </p>
          <p className="text-sm text-slate-500">{member.email}</p>
        </div>
        <span
          className={`w-fit rounded-full px-2.5 py-1 text-xs ${member.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
        >
          {member.status === "active" ? t("team.active") : t("team.suspended")}
        </span>
        {manageable ? (
          <select
            aria-label={t("team.roleOf", { name: member.name })}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"
            value={member.role}
            onChange={(event) => {
              const nextRole = event.target.value;
              if (
                member.role === "owner" &&
                nextRole !== "owner" &&
                !window.confirm(t("team.confirmDemote", { name: member.name }))
              )
                return;
              operation.mutate(async () => {
                const result = await authClient.organization.updateMemberRole({
                  memberId: member.id,
                  role: nextRole,
                  organizationId: activeOrganization!.id,
                });
                if (result.error) throw new Error(result.error.message);
              });
            }}
          >
            {allowedRoles(currentRole).map((value) => (
              <option key={value} value={value}>
                {roleLabel(value)}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm">{roleLabel(member.role)}</span>
        )}
        {manageable ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (
                  member.status === "active" &&
                  !window.confirm(t("team.confirmSuspend", { name: member.name }))
                )
                  return;
                operation.mutate(() =>
                  clientApi.updateMembershipStatus(member.id, {
                    status: member.status === "active" ? "suspended" : "active",
                  }),
                );
              }}
            >
              {member.status === "active" ? <UserRoundXIcon /> : <UserRoundCheckIcon />}
              {member.status === "active" ? t("team.suspend") : t("team.reactivate")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!window.confirm(t("team.confirmRemove", { name: member.name }))) return;
                operation.mutate(async () => {
                  const result = await authClient.organization.removeMember({
                    memberIdOrEmail: member.id,
                    organizationId: activeOrganization!.id,
                  });
                  if (result.error) throw new Error(result.error.message);
                });
              }}
            >
              <Trash2Icon /> {t("team.remove")}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-medium text-violet-700">{t("team.eyebrow")}</p>
        <h1 className="mt-1 text-3xl font-semibold">{t("team.title")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("team.subtitle")}</p>
      </header>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("team.inviteMember")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem_auto]"
              onSubmit={(event) => void invite(event)}
            >
              <Input
                aria-label={t("team.inviteEmail")}
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("team.invitePlaceholder")}
              />
              <select
                aria-label={t("team.inviteRole")}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                value={role}
                onChange={(event) => setRole(event.target.value as OrganizationRoleContract)}
              >
                {allowedRoles(currentRole).map((value) => (
                  <option key={value} value={value}>
                    {roleLabel(value)}
                  </option>
                ))}
              </select>
              <Button type="submit">
                <MailPlusIcon /> {t("team.invite")}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {t("team.activeMembers", {
              count: team.data?.members.filter((member) => member.status === "active").length ?? 0,
            })}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {team.isLoading ? (
            <p className="p-5 text-sm text-slate-500">{t("loading", { ns: "common" })}</p>
          ) : null}
          {team.data?.members.filter((member) => member.status === "active").map(memberRow)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t("team.suspendedMembers", {
              count:
                team.data?.members.filter((member) => member.status === "suspended").length ?? 0,
            })}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {team.data?.members.filter((member) => member.status === "suspended").length === 0 ? (
            <p className="p-5 text-sm text-slate-500">{t("team.noSuspended")}</p>
          ) : null}
          {team.data?.members.filter((member) => member.status === "suspended").map(memberRow)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t("team.pendingInvitations", { count: team.data?.invitations.length ?? 0 })}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {team.data?.invitations.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">{t("team.noInvitations")}</p>
          ) : null}
          {team.data?.invitations.map((invitation) => (
            <div
              key={invitation.id}
              className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{invitation.email}</p>
                <p className="text-xs text-slate-500">
                  {t("team.expiresOn", {
                    role: roleLabel(invitation.role),
                    date: format.dateTime(invitation.expiresAt),
                  })}
                </p>
                {invitation.deliveryError ? (
                  <p className="mt-1 text-xs text-red-700">{invitation.deliveryError}</p>
                ) : null}
              </div>
              <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                {invitation.deliveryStatus
                  ? t(`team.delivery.${invitation.deliveryStatus}`)
                  : t("team.notConfigured")}
              </span>
              {canManage ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      operation.mutate(async () => {
                        const result = await authClient.organization.inviteMember({
                          email: invitation.email,
                          role: invitation.role,
                          organizationId: activeOrganization!.id,
                          resend: true,
                        });
                        if (result.error) throw new Error(result.error.message);
                      })
                    }
                  >
                    <RefreshCwIcon /> {t("team.resend")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!window.confirm(t("team.confirmCancel", { email: invitation.email })))
                        return;
                      operation.mutate(async () => {
                        const result = await authClient.organization.cancelInvitation({
                          invitationId: invitation.id,
                        });
                        if (result.error) throw new Error(result.error.message);
                      });
                    }}
                  >
                    <ShieldAlertIcon /> {t("team.cancel")}
                  </Button>
                </>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
