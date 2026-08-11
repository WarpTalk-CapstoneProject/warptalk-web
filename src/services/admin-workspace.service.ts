import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminPagedResult,
  AdminWorkspaceDetailDto,
  AdminWorkspaceDirectoryQuery,
  AdminWorkspaceSummaryDto,
} from "@/types/admin-workspace";
import type {
  WorkspaceKnowledgePageDto,
  WorkspaceKnowledgeQuery,
} from "@/types/workspace-knowledge";

/**
 * System-admin workspace directory. Every call is platform-wide and gated server-side by the
 * "admin" role — the UI guard in the /admin layout is a convenience, not the boundary.
 */
export const adminWorkspaceService = {
  getDirectory: async (
    query: AdminWorkspaceDirectoryQuery,
  ): Promise<AdminPagedResult<AdminWorkspaceSummaryDto>> => {
    const { data } = await apiClient.get<AdminPagedResult<AdminWorkspaceSummaryDto>>(
      API.adminWorkspaces.base,
      { params: query },
    );
    return data;
  },

  getDetail: async (workspaceId: string): Promise<AdminWorkspaceDetailDto> => {
    const { data } = await apiClient.get<AdminWorkspaceDetailDto>(
      API.adminWorkspaces.detail(workspaceId),
    );
    return data;
  },

  suspend: async (workspaceId: string, reason: string): Promise<AdminWorkspaceDetailDto> => {
    const { data } = await apiClient.post<AdminWorkspaceDetailDto>(
      API.adminWorkspaces.suspend(workspaceId),
      { reason },
    );
    return data;
  },

  reactivate: async (workspaceId: string, reason: string): Promise<AdminWorkspaceDetailDto> => {
    const { data } = await apiClient.post<AdminWorkspaceDetailDto>(
      API.adminWorkspaces.reactivate(workspaceId),
      { reason },
    );
    return data;
  },

  /**
   * What the assistant can retrieve for this workspace. The response shape is the member-scoped
   * one (`WorkspaceKnowledgePageDto`) because both surfaces read the same index through the same
   * service method server-side; only the authorization in front of it differs.
   */
  listKnowledge: async (
    workspaceId: string,
    query: WorkspaceKnowledgeQuery = {},
  ): Promise<WorkspaceKnowledgePageDto> => {
    const { data } = await apiClient.get<WorkspaceKnowledgePageDto>(
      API.adminWorkspaces.knowledge(workspaceId),
      { params: query },
    );
    return data;
  },
};
