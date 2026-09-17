"use client";

import { useQuery } from "@tanstack/react-query";

import { workspaceAuditService } from "@/services/workspace-audit.service";
import type { WorkspaceAuditLogQuery } from "@/types/workspace-audit";

export const WORKSPACE_AUDIT_KEYS = {
  query: (workspaceId: string, query: WorkspaceAuditLogQuery) =>
    ["workspace-audit", workspaceId, query] as const,
};

export function useWorkspaceAuditLog(
  workspaceId: string,
  query: WorkspaceAuditLogQuery,
  enabled = true,
) {
  return useQuery({
    queryKey: WORKSPACE_AUDIT_KEYS.query(workspaceId, query),
    queryFn: () => workspaceAuditService.query(workspaceId, query),
    enabled: enabled && Boolean(workspaceId),
    // Keep the previous page while paging, but never across workspaces: another tenant's rows
    // must not flash under this one's header.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === workspaceId ? previous : undefined,
    staleTime: 30_000,
  });
}
