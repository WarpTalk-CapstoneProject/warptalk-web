import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminPagedResult,
  AdminWorkspaceDetailDto,
  AdminWorkspaceDirectoryQuery,
  AdminWorkspaceMemberDto,
  AdminWorkspaceSummaryDto,
} from "@/types/admin-workspace";
import type {
  AdminCreditTransactionDto,
  AdminWorkspaceAnalyticsDto,
} from "@/types/admin-workspace-analytics";

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

  getDetailBySlug: async (slug: string): Promise<AdminWorkspaceDetailDto> => {
    const { data } = await apiClient.get<AdminWorkspaceDetailDto>(
      API.adminWorkspaces.detailBySlug(slug),
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

  /** Billing-side analytics (WT-206). Default window is the server's: the last 30 days. */
  getAnalytics: async (workspaceId: string): Promise<AdminWorkspaceAnalyticsDto> => {
    const { data } = await apiClient.get<AdminWorkspaceAnalyticsDto>(
      API.adminWorkspaceAnalytics.analytics(workspaceId),
    );
    return data;
  },

  getCreditTransactions: async (
    workspaceId: string,
    query: { page?: number; pageSize?: number } = {},
  ): Promise<AdminPagedResult<AdminCreditTransactionDto>> => {
    const { data } = await apiClient.get<AdminPagedResult<AdminCreditTransactionDto>>(
      API.adminWorkspaceAnalytics.creditTransactions(workspaceId),
      { params: query },
    );
    return data;
  },
};
