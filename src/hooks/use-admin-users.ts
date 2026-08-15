"use client";

import { useQuery } from "@tanstack/react-query";

import { adminUserService } from "@/services/admin-user.service";
import type { AdminUserDirectoryQuery } from "@/types/admin-user";

export const ADMIN_USER_KEYS = {
  all: ["admin-users"] as const,
  directory: (query: AdminUserDirectoryQuery) => ["admin-users", "directory", query] as const,
  detail: (id: string) => ["admin-users", "detail", id] as const,
};

/**
 * The platform user directory.
 *
 * `placeholderData` keeps the previous page on screen while the next one loads. Without it every
 * page turn and every filter change blanks the table for a frame — which is exactly what an empty
 * platform looks like, on the one screen where "there are no users" would be alarming.
 */
export function useAdminUserDirectory(query: AdminUserDirectoryQuery) {
  return useQuery({
    queryKey: ADMIN_USER_KEYS.directory(query),
    queryFn: () => adminUserService.getDirectory(query),
    placeholderData: (previous) => previous,
    // A management surface, not a live dashboard: keep it bounded so paging through the
    // directory does not re-run the aggregation on every keystroke.
    staleTime: 30_000,
  });
}

export function useAdminUserDetail(userId: string | undefined) {
  return useQuery({
    queryKey: ADMIN_USER_KEYS.detail(userId ?? ""),
    queryFn: () => adminUserService.getDetail(userId!),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}
