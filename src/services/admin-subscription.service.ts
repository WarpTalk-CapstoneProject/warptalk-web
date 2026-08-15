import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminSubscriptionDirectoryQuery,
  AdminSubscriptionSummaryDto,
  AdminSubscriptionSummaryTotalsDto,
} from "@/types/admin-subscription";
import type { AdminPagedResult } from "@/types/admin-workspace";

/**
 * System-admin subscription directory. Platform-wide and gated server-side by the "admin" role —
 * the UI guard in the /admin layout is a convenience, not the boundary.
 *
 * Read-only, because the API is: changing a plan or cancelling a subscription already has its own
 * validated path, and a second thinner one behind an admin table would be untested.
 */
export const adminSubscriptionService = {
  getDirectory: async (
    query: AdminSubscriptionDirectoryQuery,
  ): Promise<AdminPagedResult<AdminSubscriptionSummaryDto>> => {
    const { data } = await apiClient.get<AdminPagedResult<AdminSubscriptionSummaryDto>>(
      API.adminSubscriptions.base,
      { params: query },
    );
    return data;
  },

  /**
   * Its own call, not a field on the directory. Recurring revenue is computed over EVERY active
   * subscription; folding it into a page of twenty would invite reading it as the page's total.
   */
  getSummary: async (): Promise<AdminSubscriptionSummaryTotalsDto> => {
    const { data } = await apiClient.get<AdminSubscriptionSummaryTotalsDto>(
      API.adminSubscriptions.summary,
    );
    return data;
  },
};
