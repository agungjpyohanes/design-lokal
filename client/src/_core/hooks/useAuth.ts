import { trpc } from "@/lib/trpc";
import { useCallback, useMemo } from "react";
import type { AppRole } from "@shared/workflow";

export interface DemoUser {
  id: number;
  openId: string;
  name: string;
  email: string;
  loginMethod: string;
  appRole: AppRole;
  isSuperAdmin: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  lastLoginAt?: string | Date;
}

export const DEFAULT_CLIENT_USER: DemoUser = {
  id: 1,
  openId: "demo-superadmin-001",
  name: "Ahmad Zaky (Superadmin)",
  email: "zaky.superadmin@desainlokal.id",
  loginMethod: "demo",
  appRole: "superadmin",
  isSuperAdmin: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastLoginAt: new Date().toISOString(),
};

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(_options?: UseAuthOptions) {
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, undefined);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // ignore
    } finally {
      utils.auth.me.setData(undefined, undefined);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    const activeUser = ((meQuery.data as unknown) as DemoUser | null) ?? DEFAULT_CLIENT_USER;
    return {
      user: activeUser,
      loading: false, // Bypass loading state to show dashboard immediately
      error: null,
      isAuthenticated: true, // Always authenticated in demo bypass mode
    };
  }, [meQuery.data]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
