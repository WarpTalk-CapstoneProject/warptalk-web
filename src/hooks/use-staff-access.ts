"use client";

import { useQuery } from "@tanstack/react-query";

import { useIsSystemAdmin } from "@/hooks/use-is-system-admin";
import {
  canViewAdminPath,
  hasPermission,
  NO_STAFF_ACCESS,
  type AdminPermission,
  type StaffAccessSnapshot,
} from "@/lib/admin/staff-permissions";
import { adminStaffService } from "@/services/admin-staff.service";
import { useAuthStore } from "@/stores/auth-store";

export const STAFF_ACCESS_KEY = ["staff-access"] as const;

/**
 * The signed-in person's platform-staff access (G10), from `GET /api/v1/auth/staff-access`.
 *
 * Asked only when the token carries the staff hint (role "admin"), so an ordinary user never
 * makes the call. Re-asked every minute and on focus: the servers apply a role change or a
 * suspension within 30 seconds, and a portal still offering yesterday's buttons would only lead
 * to 403s. `isLoading` is true until the first answer, so callers can avoid flashing either the
 * portal or the refusal.
 */
export function useStaffAccess(): { access: StaffAccessSnapshot; isLoading: boolean; isError: boolean } {
  const hint = useIsSystemAdmin();
  const userId = useAuthStore((state) => state.user?.id);
  const query = useQuery({
    queryKey: [...STAFF_ACCESS_KEY, userId ?? "anonymous"],
    queryFn: adminStaffService.me,
    enabled: hint && Boolean(userId),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  if (!hint) return { access: NO_STAFF_ACCESS, isLoading: false, isError: false };
  return {
    access: query.data ?? NO_STAFF_ACCESS,
    isLoading: query.isPending,
    isError: query.isError,
  };
}

/** Whether to offer something that needs `permission`. The server decides whether it works. */
export function useCan(permission: AdminPermission): boolean {
  const { access } = useStaffAccess();
  return hasPermission(access, permission);
}

export function useCanViewAdminPath(pathname: string): boolean {
  const { access } = useStaffAccess();
  return canViewAdminPath(access, pathname);
}
