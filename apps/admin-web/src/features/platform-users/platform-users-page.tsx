import { Badge } from "@qhse/ui/components/badge";
import { Button } from "@qhse/ui/components/button";
import { Card, CardContent, CardHeader } from "@qhse/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@qhse/ui/components/dialog";
import { Input } from "@qhse/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@qhse/ui/components/native-select";
import { Skeleton } from "@qhse/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@qhse/ui/components/table";
import {
  KeyRoundIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserRoundCheckIcon,
  UsersRoundIcon,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { useAdminAuth } from "../../auth.js";
import { adminApi, formatDate } from "../../lib/admin-api.js";

const roles = ["platform_admin", "content_manager", "support"] as const;
type ManageableRole = (typeof roles)[number];

type PlatformOperator = {
  id: string;
  name: string;
  email: string;
  platformRole: string;
  status: string;
  locale: string;
  timezone: string;
  createdAt: string;
};

const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  platformRole: "content_manager" as ManageableRole,
};

export function PlatformUsersPage() {
  const { user } = useAdminAuth();
  const [operators, setOperators] = useState<PlatformOperator[] | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const canManage = user?.platformRole === "super_admin";

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (role) params.set("role", role);
    if (status) params.set("status", status);
    try {
      setError(null);
      setOperators(await adminApi<PlatformOperator[]>(`/v1/platform-users?${params}`));
    } catch (reason) {
      setError(messageFrom(reason, "Unable to load platform operators"));
    }
  }, [role, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const activeCount = operators?.filter(({ status: value }) => value === "active").length ?? 0;

  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-700">Access management</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Platform operators</h1>
          <p className="mt-2 text-sm text-slate-600">
            Create accounts that can sign in directly to the administration workspace.
          </p>
        </div>
        {canManage ? (
          <Button
            className="h-10 rounded-xl bg-slate-950 px-4 text-white hover:bg-slate-800"
            onClick={() => setCreateOpen(true)}
          >
            <PlusIcon /> Add operator
          </Button>
        ) : null}
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric icon={UsersRoundIcon} label="Operators" value={operators?.length ?? "—"} />
        <Metric
          icon={UserRoundCheckIcon}
          label="Active access"
          value={operators ? activeCount : "—"}
        />
        <Metric
          icon={ShieldCheckIcon}
          label="Your role"
          value={roleLabel(user?.platformRole ?? "user")}
        />
      </div>

      {!canManage ? (
        <p className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          Only a super administrator can create platform operators.
        </p>
      ) : null}
      {success ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}
      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : null}

      <Card className="overflow-hidden rounded-3xl border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-64 flex-1">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9"
                placeholder="Search name or email"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <NativeSelect value={role} onChange={(event) => setRole(event.target.value)}>
              <NativeSelectOption value="">All roles</NativeSelectOption>
              {roles.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {roleLabel(value)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect value={status} onChange={(event) => setStatus(event.target.value)}>
              <NativeSelectOption value="">All statuses</NativeSelectOption>
              <NativeSelectOption value="active">Active</NativeSelectOption>
              <NativeSelectOption value="suspended">Suspended</NativeSelectOption>
            </NativeSelect>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!operators ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3].map((row) => (
                <Skeleton key={row} className="h-14 w-full" />
              ))}
            </div>
          ) : operators.length === 0 ? (
            <div className="grid place-items-center px-6 py-16 text-center">
              <UsersRoundIcon className="size-7 text-slate-400" />
              <p className="mt-3 font-medium">No operator matches these filters</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operator</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Locale</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operators.map((operator) => (
                  <TableRow key={operator.id} className="hover:bg-violet-50/40">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-xs font-semibold text-violet-700">
                          {initials(operator.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{operator.name}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {operator.email}
                          </span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {roleLabel(operator.platformRole)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          operator.status === "active"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                        }
                      >
                        {operator.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {operator.locale} · {operator.timezone}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {formatDate(operator.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateOperatorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(operator) => {
          setSuccess(`${operator.name} can now access the administration dashboard.`);
          setCreateOpen(false);
          void load();
        }}
      />
    </section>
  );
}

function CreateOperatorDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (operator: PlatformOperator) => void;
}) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setForm(emptyForm);
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const operator = await adminApi<PlatformOperator>("/v1/platform-users", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm(emptyForm);
      onCreated(operator);
    } catch (reason) {
      setError(messageFrom(reason, "Unable to create this operator"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Add a platform operator</DialogTitle>
          <DialogDescription>
            The account becomes active immediately. Share its password through a secure channel.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">
              <Input
                required
                autoComplete="off"
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
              />
            </Field>
            <Field label="Last name">
              <Input
                required
                autoComplete="off"
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
              />
            </Field>
            <Field label="Email" wide>
              <Input
                required
                type="email"
                autoComplete="off"
                placeholder="operator@company.com"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </Field>
            <Field label="Role">
              <NativeSelect
                className="w-full"
                value={form.platformRole}
                onChange={(event) =>
                  setForm({ ...form, platformRole: event.target.value as ManageableRole })
                }
              >
                {roles.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {roleLabel(value)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Password">
              <Input
                required
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                placeholder="12 characters minimum"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </Field>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
            <b>Platform admin</b> manages administration. <b>Content manager</b> manages normative
            documents. <b>Support</b> has operational read-only access.
          </div>
          {error ? (
            <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="bg-violet-600 text-white hover:bg-violet-500"
              disabled={busy}
              type="submit"
            >
              <KeyRoundIcon /> {busy ? "Creating…" : "Create access"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersRoundIcon;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="rounded-3xl border-slate-200 shadow-sm">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-xl font-semibold capitalize">{value}</p>
        </div>
        <span className="rounded-2xl bg-violet-50 p-3 text-violet-700">
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`space-y-1.5 text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function roleLabel(value: string) {
  return value.replaceAll("_", " ");
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function messageFrom(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}
