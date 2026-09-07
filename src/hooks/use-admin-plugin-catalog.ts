"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminPluginCatalogService } from "@/services/admin-plugin-catalog.service";
import type {
  AdminPluginCatalogDetailDto,
  AdminPluginToolAuditQuery,
  ReplaceAdminPluginToolsRequest,
  SetAdminPluginOAuthClientRequest,
  UpdateAdminPluginRequest,
} from "@/types/admin-plugin-catalog";

export const ADMIN_PLUGIN_CATALOG_KEYS = {
  all: ["admin-plugin-catalog"] as const,
  list: ["admin-plugin-catalog", "list"] as const,
  detail: (pluginKey: string) => ["admin-plugin-catalog", "detail", pluginKey] as const,
  audits: (pluginKey: string, query: AdminPluginToolAuditQuery) =>
    ["admin-plugin-catalog", "audits", pluginKey, query] as const,
};

/**
 * The whole catalog, retired rows included.
 *
 * A short stale time rather than a long one: this is the screen an operator opens while fixing a
 * row, often with a second tab or a colleague changing the same data, and a five-minute cache
 * there means editing something you are no longer looking at.
 */
export function useAdminPluginCatalog() {
  return useQuery({
    queryKey: ADMIN_PLUGIN_CATALOG_KEYS.list,
    queryFn: () => adminPluginCatalogService.list(),
    staleTime: 15_000,
  });
}

export function useAdminPluginCatalogDetail(pluginKey: string | undefined) {
  return useQuery({
    queryKey: ADMIN_PLUGIN_CATALOG_KEYS.detail(pluginKey ?? ""),
    queryFn: () => adminPluginCatalogService.get(pluginKey!),
    enabled: Boolean(pluginKey),
    staleTime: 15_000,
    // A row that has just been hard-deleted is gone; retrying a 404 four times only delays
    // telling the operator so.
    retry: (failureCount, error) =>
      (error as { response?: { status?: number } })?.response?.status === 404
        ? false
        : failureCount < 2,
  });
}

export function useAdminPluginAudits(
  pluginKey: string | undefined,
  query: AdminPluginToolAuditQuery,
) {
  return useQuery({
    queryKey: ADMIN_PLUGIN_CATALOG_KEYS.audits(pluginKey ?? "", query),
    queryFn: () => adminPluginCatalogService.audits(pluginKey!, query),
    enabled: Boolean(pluginKey),
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });
}

/**
 * Every write answers with the row it wrote, so the detail cache is seeded from the response
 * rather than refetched — and the LIST is invalidated as well, because all four of these change
 * something the list renders: the active pill, the OAuth source, the client-id warning badge and
 * the tool count.
 */
function useCatalogWrite<TArgs>(
  pluginKey: string,
  mutationFn: (args: TArgs) => Promise<AdminPluginCatalogDetailDto>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (detail) => {
      queryClient.setQueryData(ADMIN_PLUGIN_CATALOG_KEYS.detail(pluginKey), detail);
      void queryClient.invalidateQueries({ queryKey: ADMIN_PLUGIN_CATALOG_KEYS.list });
    },
  });
}

export function useUpdateAdminPlugin(pluginKey: string) {
  return useCatalogWrite(pluginKey, (request: UpdateAdminPluginRequest) =>
    adminPluginCatalogService.update(pluginKey, request),
  );
}

export function useSetAdminPluginOAuthClient(pluginKey: string) {
  return useCatalogWrite(pluginKey, (request: SetAdminPluginOAuthClientRequest) =>
    adminPluginCatalogService.setOAuthClient(pluginKey, request),
  );
}

export function useReplaceAdminPluginTools(pluginKey: string) {
  return useCatalogWrite(pluginKey, (request: ReplaceAdminPluginToolsRequest) =>
    adminPluginCatalogService.replaceTools(pluginKey, request),
  );
}

export function useRediscoverAdminPlugin(pluginKey: string) {
  return useCatalogWrite<void>(pluginKey, () => adminPluginCatalogService.rediscover(pluginKey));
}

/**
 * Delete is its own hook rather than a `useCatalogWrite`: it answers with a delete result, not a
 * row, and a hard delete leaves nothing to seed. The detail cache is dropped instead so the page
 * cannot go on rendering a row that no longer exists.
 */
export function useDeleteAdminPlugin(pluginKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hard: boolean) => adminPluginCatalogService.remove(pluginKey, hard),
    onSuccess: (result) => {
      if (result.hardDeleted) {
        queryClient.removeQueries({ queryKey: ADMIN_PLUGIN_CATALOG_KEYS.detail(pluginKey) });
      } else {
        void queryClient.invalidateQueries({
          queryKey: ADMIN_PLUGIN_CATALOG_KEYS.detail(pluginKey),
        });
      }
      void queryClient.invalidateQueries({ queryKey: ADMIN_PLUGIN_CATALOG_KEYS.list });
    },
  });
}
