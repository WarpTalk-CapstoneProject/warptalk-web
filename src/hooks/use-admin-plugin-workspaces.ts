"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ADMIN_PLUGIN_CATALOG_KEYS } from "@/hooks/use-admin-plugin-catalog";
import { adminPluginWorkspacesService } from "@/services/admin-plugin-workspaces.service";
import type {
  ApplyAdminPluginOverrideRequest,
  SetAdminPluginAvailabilityRequest,
  SetAdminWorkspacePluginOverrideRequest,
} from "@/types/admin-plugin-workspaces";

export const ADMIN_PLUGIN_WORKSPACE_KEYS = {
  all: ["admin-plugin-workspaces"] as const,
  forPlugin: (pluginKey: string) => ["admin-plugin-workspaces", "plugin", pluginKey] as const,
  forWorkspace: (workspaceId: string) => ["admin-plugin-workspaces", "workspace", workspaceId] as const,
};

/** A 404 (unknown plugin or workspace) will not become a 200 by asking again. */
function retryUnlessNotFound(failureCount: number, error: unknown) {
  return (error as { response?: { status?: number } })?.response?.status === 404 ? false : failureCount < 2;
}

export function useAdminPluginWorkspaces(pluginKey: string | undefined) {
  return useQuery({
    queryKey: ADMIN_PLUGIN_WORKSPACE_KEYS.forPlugin(pluginKey ?? ""),
    queryFn: () => adminPluginWorkspacesService.listForPlugin(pluginKey!),
    enabled: Boolean(pluginKey),
    staleTime: 15_000,
    retry: retryUnlessNotFound,
  });
}

export function useAdminWorkspacePlugins(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ADMIN_PLUGIN_WORKSPACE_KEYS.forWorkspace(workspaceId ?? ""),
    queryFn: () => adminPluginWorkspacesService.listForWorkspace(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 15_000,
    retry: retryUnlessNotFound,
  });
}

/**
 * Every write here changes what both tabs and the catalog listing show (the workspace count, the
 * default badge, retired state), so all three are refetched rather than patched in place.
 */
function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ADMIN_PLUGIN_WORKSPACE_KEYS.all }),
      queryClient.invalidateQueries({ queryKey: ADMIN_PLUGIN_CATALOG_KEYS.all }),
    ]);
}

export function useSetAdminPluginAvailability(pluginKey: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (request: SetAdminPluginAvailabilityRequest) =>
      adminPluginWorkspacesService.setAvailability(pluginKey, request),
    onSuccess: () => invalidate(),
  });
}

export function useApplyAdminPluginOverride(pluginKey: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (request: ApplyAdminPluginOverrideRequest) =>
      adminPluginWorkspacesService.applyOverride(pluginKey, request),
    onSuccess: () => invalidate(),
  });
}

export function useSetAdminWorkspacePluginOverride(workspaceId: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ pluginKey, request }: { pluginKey: string; request: SetAdminWorkspacePluginOverrideRequest }) =>
      adminPluginWorkspacesService.setWorkspaceOverride(workspaceId, pluginKey, request),
    onSuccess: () => invalidate(),
  });
}
