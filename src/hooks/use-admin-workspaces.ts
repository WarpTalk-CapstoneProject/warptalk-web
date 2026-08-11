"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminWorkspaceService } from "@/services/admin-workspace.service";
import type { AdminWorkspaceDirectoryQuery } from "@/types/admin-workspace";
import type { WorkspaceKnowledgeQuery } from "@/types/workspace-knowledge";

export const ADMIN_WORKSPACE_KEYS = {
  all: ["admin-workspaces"] as const,
  directory: (query: AdminWorkspaceDirectoryQuery) =>
    ["admin-workspaces", "directory", query] as const,
  detail: (id: string) => ["admin-workspaces", "detail", id] as const,
  knowledge: (id: string, query: WorkspaceKnowledgeQuery) =>
    ["admin-workspaces", "knowledge", id, query] as const,
};

export function useAdminWorkspaceDirectory(query: AdminWorkspaceDirectoryQuery) {
  return useQuery({
    queryKey: ADMIN_WORKSPACE_KEYS.directory(query),
    queryFn: () => adminWorkspaceService.getDirectory(query),
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

/**
 * Reads the workspace's index as a platform admin. `placeholderData` keeps the previous page
 * on screen while the next cursor loads — without it, every page turn blanks the table and
 * reads as "nothing indexed" for a frame.
 */
export function useAdminWorkspaceKnowledge(
  workspaceId: string | undefined,
  query: WorkspaceKnowledgeQuery = {},
) {
  return useQuery({
    queryKey: ADMIN_WORKSPACE_KEYS.knowledge(workspaceId ?? "", query),
    queryFn: () => adminWorkspaceService.listKnowledge(workspaceId!, query),
    enabled: Boolean(workspaceId),
    placeholderData: (previous) => previous,
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
