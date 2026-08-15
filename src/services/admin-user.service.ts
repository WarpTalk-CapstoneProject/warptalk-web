import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminUserDetailDto,
  AdminUserDirectoryQuery,
  AdminUserSummaryDto,
} from "@/types/admin-user";
import type { AdminPagedResult } from "@/types/admin-workspace";

/**
 * System-admin user directory. Every call is platform-wide and gated server-side by the "admin"
 * role — the UI guard in the /admin layout is a convenience, not the boundary.
 *
 * Read-only by design: the API has no mutation, because ending somebody's sessions is a
 * privileged action and the auth service has no bus to audit it on.
 */
export const adminUserService = {
  getDirectory: async (
    query: AdminUserDirectoryQuery,
  ): Promise<AdminPagedResult<AdminUserSummaryDto>> => {
    const { data } = await apiClient.get<AdminPagedResult<AdminUserSummaryDto>>(
      API.adminUsers.base,
      { params: query },
    );
    return data;
  },

  getDetail: async (userId: string): Promise<AdminUserDetailDto> => {
    const { data } = await apiClient.get<AdminUserDetailDto>(API.adminUsers.detail(userId));
    return data;
  },
};
