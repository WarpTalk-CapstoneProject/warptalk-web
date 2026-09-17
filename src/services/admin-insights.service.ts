import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  BillingInsightsDto,
  BillingSnapshotDto,
  InsightsQuery,
  MeetingsInsightsDto,
  UsersInsightsDto,
  WorkspacesInsightsDto,
} from "@/types/admin-insights";

/**
 * The platform Insights page's five sources. Read-only, system-admin only, one GET each.
 *
 * Each is fetched on its own so one failing service never takes the others down with it: the page
 * renders every source that answered and marks the rest "not available yet".
 */
export const adminInsightsService = {
  getBilling: async (query: InsightsQuery): Promise<BillingInsightsDto> => {
    const { data } = await apiClient.get<BillingInsightsDto>(API.adminInsights.billing, {
      params: query,
    });
    return data;
  },

  getBillingSnapshot: async (tz: string): Promise<BillingSnapshotDto> => {
    const { data } = await apiClient.get<BillingSnapshotDto>(API.adminInsights.billingSnapshot, {
      params: { tz },
    });
    return data;
  },

  getUsers: async (query: InsightsQuery): Promise<UsersInsightsDto> => {
    const { data } = await apiClient.get<UsersInsightsDto>(API.adminInsights.users, {
      params: query,
    });
    return data;
  },

  getWorkspaces: async (query: InsightsQuery): Promise<WorkspacesInsightsDto> => {
    const { data } = await apiClient.get<WorkspacesInsightsDto>(API.adminInsights.workspaces, {
      params: query,
    });
    return data;
  },

  getMeetings: async (query: InsightsQuery): Promise<MeetingsInsightsDto> => {
    const { data } = await apiClient.get<MeetingsInsightsDto>(API.adminInsights.meetings, {
      params: query,
    });
    return data;
  },
};
