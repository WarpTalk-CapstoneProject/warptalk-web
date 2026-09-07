"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminWorkspaceService } from "@/services/admin-workspace.service";
import { workspaceRefKind, type WorkspaceRefKind } from "@/lib/admin/workspace-ref";
import type {
  AdminWorkspaceDetailDto,
  AdminWorkspaceDirectoryQuery,
} from "@/types/admin-workspace";

export const ADMIN_WORKSPACE_KEYS = {
  all: ["admin-workspaces"] as const,
  directory: (query: AdminWorkspaceDirectoryQuery) =>
    ["admin-workspaces", "directory", query] as const,
  detailByRef: (kind: WorkspaceRefKind, ref: string) =>
    ["admin-workspaces", "detail", kind, ref] as const,
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

/**
 * The detail, addressed by whichever reference the URL carried (WT-560).
 *
 * One hook rather than a choice between two at the call site: picking a hook by the shape of a
 * route param would change the hook order between renders the moment the param resolves, which
 * React forbids. The branch lives in the query function, where it is just a URL.
 */
export function useAdminWorkspaceByRef(ref: string | undefined) {
  const kind = workspaceRefKind(ref);

  return useQuery({
    // Keyed by kind as well, so the id route and the slug route cannot collide in the cache —
    // the id page redirects to the slug page, and both are alive for a moment during it.
    queryKey: ADMIN_WORKSPACE_KEYS.detailByRef(kind, ref ?? ""),
    queryFn: () =>
      kind === "id"
        ? adminWorkspaceService.getDetail(ref!)
        : adminWorkspaceService.getDetailBySlug(ref!),
    enabled: Boolean(ref),
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

export function useAdminWorkspaceAnalytics(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["admin-workspaces", "analytics", workspaceId ?? ""] as const,
    queryFn: () => adminWorkspaceService.getAnalytics(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });
}

export function useAdminWorkspaceCreditTransactions(
  workspaceId: string | undefined,
  page: number,
) {
  return useQuery({
    queryKey: ["admin-workspaces", "credit-transactions", workspaceId ?? "", page] as const,
    queryFn: () =>
      adminWorkspaceService.getCreditTransactions(workspaceId!, { page, pageSize: 20 }),
    enabled: Boolean(workspaceId),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

/**
 * A lifecycle response describes the workspace it acted on, so it can seed the page under
 * either reference the URL might be carrying — the id route redirects to the slug route, and
 * for a moment both are live.
 */
function seedBothRoutes(
  queryClient: ReturnType<typeof useQueryClient>,
  detail: AdminWorkspaceDetailDto,
) {
  queryClient.setQueryData(ADMIN_WORKSPACE_KEYS.detailByRef("id", detail.id), detail);
  queryClient.setQueryData(ADMIN_WORKSPACE_KEYS.detailByRef("slug", detail.slug), detail);
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
      seedBothRoutes(queryClient, detail);
      void queryClient.invalidateQueries({ queryKey: ADMIN_WORKSPACE_KEYS.all });
    },
  });
}

export function useReactivateAdminWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => adminWorkspaceService.reactivate(workspaceId, reason),
    onSuccess: (detail) => {
      seedBothRoutes(queryClient, detail);
      void queryClient.invalidateQueries({ queryKey: ADMIN_WORKSPACE_KEYS.all });
    },
  });
}

export function useDeleteAdminWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => adminWorkspaceService.delete(workspaceId, reason),
    onSuccess: (detail) => {
      seedBothRoutes(queryClient, detail);
      void queryClient.invalidateQueries({ queryKey: ADMIN_WORKSPACE_KEYS.all });
    },
  });
}
