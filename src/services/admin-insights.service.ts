import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  BillingInsightsDto,
  BillingSnapshotDto,
  FxRateStatusDto,
  FxRefreshResultDto,
  InsightsQuery,
  MeetingsInsightsDto,
  ProfitAndLossDto,
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

  getProfitAndLoss: async (query: InsightsQuery): Promise<ProfitAndLossDto> => {
    const { data } = await apiClient.get<ProfitAndLossDto>(API.adminInsights.pnl, { params: query });
    return data;
  },

  getFxRate: async (): Promise<FxRateStatusDto> => {
    const { data } = await apiClient.get<FxRateStatusDto>(API.adminFx.status);
    return data;
  },

  refreshFxRate: async (): Promise<FxRefreshResultDto> => {
    const { data } = await apiClient.post<FxRefreshResultDto>(API.adminFx.refresh);
    return data;
  },

  setFxOverride: async (rate: number): Promise<FxRateStatusDto> => {
    const { data } = await apiClient.put<FxRateStatusDto>(API.adminFx.override, { rate });
    return data;
  },

  clearFxOverride: async (): Promise<FxRateStatusDto> => {
    const { data } = await apiClient.delete<FxRateStatusDto>(API.adminFx.override);
    return data;
  },

  getMeetings: async (query: InsightsQuery): Promise<MeetingsInsightsDto> => {
    const { data } = await apiClient.get<MeetingsInsightsDto>(API.adminInsights.meetings, {
      params: query,
    });
    return data;
  },
};
