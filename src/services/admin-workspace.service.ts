import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminPagedResult,
  AdminWorkspaceDetailDto,
  AdminWorkspaceDirectoryQuery,
  AdminWorkspaceMemberDto,
  AdminWorkspaceSummaryDto,
} from "@/types/admin-workspace";

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

  /** Irreversible from this API: a deleted workspace has left the lifecycle. */
  delete: async (workspaceId: string, reason: string): Promise<AdminWorkspaceDetailDto> => {
    const { data } = await apiClient.post<AdminWorkspaceDetailDto>(
      API.adminWorkspaces.delete(workspaceId),
      { reason },
    );
    return data;
  },

  /** Roster with identities resolved from Auth. Membership facts only, never tenant content. */
  getMembers: async (workspaceId: string): Promise<AdminWorkspaceMemberDto[]> => {
    const { data } = await apiClient.get<AdminWorkspaceMemberDto[]>(
      API.adminWorkspaces.members(workspaceId),
    );
    return data;
  },
};
