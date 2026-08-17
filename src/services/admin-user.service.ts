import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminUserActionRequest,
  AdminUserDetailDto,
  AdminUserDirectoryQuery,
  AdminUserSummaryDto,
} from "@/types/admin-user";
import type { AdminPagedResult } from "@/types/admin-workspace";

/**
 * System-admin user directory. Every call is platform-wide and gated server-side by the "admin"
 * role — the UI guard in the /admin layout is a convenience, not the boundary.
 *
 * The three actions here are reversible or self-limiting, and every one of them is recorded in
 * the platform audit log BEFORE it is committed: auth records it over gRPC to the workspace
 * service and abandons the change if the record fails. So a 500 from one of these can mean the
 * audit log was unreachable and NOTHING happened — which is the intended outcome, not a bug to
 * retry around.
 *
 * There is no delete. A user's rows reach transcripts, voice profiles and billing records across
 * four services, so removing one is a data-lifecycle decision rather than a button on a table.
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

  /**
   * End every session the account has open.
   *
   * Does not lock the account or change its password — the person can sign in again immediately.
   * This is the "signed in somewhere they should not be" response, not a punishment.
   */
  revokeSessions: async (
    userId: string,
    request: AdminUserActionRequest,
  ): Promise<AdminUserDetailDto> => {
    const { data } = await apiClient.post<AdminUserDetailDto>(
      API.adminUsers.revokeSessions(userId),
      request,
    );
    return data;
  },

  /** Turn the account off, or back on. Deactivating also ends the sessions already open. */
  setActive: async (
    userId: string,
    isActive: boolean,
    request: AdminUserActionRequest,
  ): Promise<AdminUserDetailDto> => {
    const { data } = await apiClient.post<AdminUserDetailDto>(
      isActive ? API.adminUsers.reactivate(userId) : API.adminUsers.deactivate(userId),
      request,
    );
    return data;
  },

  /** Clear a failed-login lockout. Distinct from reactivate: they are different states. */
  unlock: async (
    userId: string,
    request: AdminUserActionRequest,
  ): Promise<AdminUserDetailDto> => {
    const { data } = await apiClient.post<AdminUserDetailDto>(
      API.adminUsers.unlock(userId),
      request,
    );
    return data;
  },
};
