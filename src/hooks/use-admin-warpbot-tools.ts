"use client";

import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";

import { adminWarpbotToolsService } from "@/services/admin-warpbot-tools.service";
import { adminWorkspaceService } from "@/services/admin-workspace.service";
import type { AdminToolInsightsQuery } from "@/types/admin-warpbot-tools";

export const ADMIN_WARPBOT_TOOLS_KEYS = {
  all: ["admin", "warpbot-tools"] as const,
  usage: (query: AdminToolInsightsQuery) => ["admin", "warpbot-tools", "usage", query.from, query.to] as const,
  workspaceName: (workspaceId: string) => ["admin", "warpbot-tools", "workspace-name", workspaceId] as const,
};

/**
 * Platform-wide tool usage for one window. The previous window's data stays on screen while a new
 * period loads, and an older backend without the endpoint answers once (404), not four times.
 */
export function useAdminWarpbotToolUsage(query: AdminToolInsightsQuery, enabled = true) {
  return useQuery({
    queryKey: ADMIN_WARPBOT_TOOLS_KEYS.usage(query),
    queryFn: () => adminWarpbotToolsService.getUsage(query),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      return status === 404 || status === 403 ? false : failureCount < 2;
    },
  });
}

/**
 * Names for the top-workspaces table, which the usage endpoint gives as ids only. One detail read
 * per listed workspace (at most 20), cached for five minutes; asked only of staff who hold
 * `workspaces.read`, and a workspace that does not resolve keeps its id.
 */
export function useAdminWorkspaceNames(workspaceIds: readonly string[], enabled: boolean): Map<string, string> {
  const results = useQueries({
    queries: workspaceIds.map((workspaceId) => ({
      queryKey: ADMIN_WARPBOT_TOOLS_KEYS.workspaceName(workspaceId),
      queryFn: async () => (await adminWorkspaceService.getDetail(workspaceId)).name,
      enabled,
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });
  const names = new Map<string, string>();
  results.forEach((result, index) => {
    const name = result.data?.trim();
    if (name) names.set(workspaceIds[index], name);
  });
  return names;
}
