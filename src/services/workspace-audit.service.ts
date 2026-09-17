import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { AdminPagedResult } from "@/types/admin-workspace";
import type { WorkspaceAuditLogEntryDto, WorkspaceAuditLogQuery } from "@/types/workspace-audit";

/** The workspace audit log. Read-only; the workspace comes from the path, never the query. */
export const workspaceAuditService = {
  query: async (
    workspaceId: string,
    query: WorkspaceAuditLogQuery,
  ): Promise<AdminPagedResult<WorkspaceAuditLogEntryDto>> => {
    const { data } = await apiClient.get<AdminPagedResult<WorkspaceAuditLogEntryDto>>(
      API.workspaces.auditLog(workspaceId),
      { params: query },
    );
    return data;
  },
};
