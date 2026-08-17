"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminWorkspaceService } from "@/services/admin-workspace.service";
import type { AdminWorkspaceDirectoryQuery } from "@/types/admin-workspace";

export const ADMIN_WORKSPACE_KEYS = {
  all: ["admin-workspaces"] as const,
  directory: (query: AdminWorkspaceDirectoryQuery) =>
    ["admin-workspaces", "directory", query] as const,
  detail: (id: string) => ["admin-workspaces", "detail", id] as const,
  members: (id: string) => ["admin-workspaces", "members", id] as const,
};

export function useAdminWorkspaceDirectory(
  query: AdminWorkspaceDirectoryQuery,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ADMIN_WORKSPACE_KEYS.directory(query),
    queryFn: () => adminWorkspaceService.getDirectory(query),
    enabled: options.enabled ?? true,
    // The directory is a management surface, not a live dashboard: keep it bounded so
    // paging through it does not hammer the aggregation query.
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function useAdminWorkspaceDetail(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ADMIN_WORKSPACE_KEYS.detail(workspaceId ?? ""),
    queryFn: () => adminWorkspaceService.getDetail(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });
}

export function useAdminWorkspaceMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ADMIN_WORKSPACE_KEYS.members(workspaceId ?? ""),
    queryFn: () => adminWorkspaceService.getMembers(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });
}

/**
 * Lifecycle mutations refetch both the detail and the directory: suspending a workspace
 * changes which status tab it belongs to, so a stale list would keep showing it as active.
 */
export function useSuspendAdminWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => adminWorkspaceService.suspend(workspaceId, reason),
    onSuccess: (detail) => {
      queryClient.setQueryData(ADMIN_WORKSPACE_KEYS.detail(workspaceId), detail);
      void queryClient.invalidateQueries({ queryKey: ADMIN_WORKSPACE_KEYS.all });
    },
  });
}

export function useReactivateAdminWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => adminWorkspaceService.reactivate(workspaceId, reason),
    onSuccess: (detail) => {
      queryClient.setQueryData(ADMIN_WORKSPACE_KEYS.detail(workspaceId), detail);
      void queryClient.invalidateQueries({ queryKey: ADMIN_WORKSPACE_KEYS.all });
    },
  });
}

export function useDeleteAdminWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => adminWorkspaceService.delete(workspaceId, reason),
    onSuccess: (detail) => {
      queryClient.setQueryData(ADMIN_WORKSPACE_KEYS.detail(workspaceId), detail);
      void queryClient.invalidateQueries({ queryKey: ADMIN_WORKSPACE_KEYS.all });
    },
  });
}
