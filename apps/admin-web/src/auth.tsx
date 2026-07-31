import { createContext, type PropsWithChildren, useCallback, useContext, useMemo } from "react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const allowedAdminRoles = [
  "super_admin",
  "platform_admin",
  "support",
  "content_manager",
] as const;
export type AdminRole = (typeof allowedAdminRoles)[number];
export type PlatformRole = "user" | AdminRole;

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  firstName: string | null;
  lastName: string | null;
  platformRole: PlatformRole;
  status: "active" | "suspended" | "deleted";
};

export function canAccessAdmin(role: string | null | undefined): role is AdminRole {
  return allowedAdminRoles.includes(role as AdminRole);
}

export const authClient = createAuthClient({
  baseURL: import.meta.env["VITE_ADMIN_API_URL"] ?? "http://localhost:3001",
  fetchOptions: { credentials: "include" },
  plugins: [
    inferAdditionalFields({
      user: {
        firstName: { type: "string", required: false },
        lastName: { type: "string", required: false },
        status: { type: ["active", "suspended", "deleted"] },
        locale: { type: "string" },
        timezone: { type: "string" },
        platformRole: {
          type: ["user", "super_admin", "platform_admin", "support", "content_manager"],
        },
      },
    }),
  ],
});

type AdminAuthContextValue = {
  user: AdminUser | null;
  isPending: boolean;
  isRefetching: boolean;
  sessionError: string | null;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: PropsWithChildren) {
  const session = authClient.useSession();
  const { refetch } = session;
  const user = useMemo<AdminUser | null>(() => {
    if (!session.data?.user) return null;
    return {
      id: session.data.user.id,
      email: session.data.user.email,
      name: session.data.user.name,
      image: session.data.user.image ?? null,
      firstName: session.data.user.firstName ?? null,
      lastName: session.data.user.lastName ?? null,
      platformRole: session.data.user.platformRole,
      status: session.data.user.status,
    };
  }, [session.data?.user]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) return result.error.message ?? "Invalid email or password.";
      await refetch();
      return null;
    },
    [refetch],
  );

  const logout = useCallback(async () => {
    const result = await authClient.signOut();
    if (result.error) throw new Error(result.error.message ?? "Unable to sign out");
    await refetch();
  }, [refetch]);

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      user,
      isPending: session.isPending,
      isRefetching: session.isRefetching,
      sessionError: session.error?.message ?? null,
      login,
      logout,
      refreshSession: refetch,
    }),
    [user, session.isPending, session.isRefetching, session.error, login, logout, refetch],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return context;
}
