import apiClient from "@/lib/api/client";
import type { CreditBalanceDto, BillingReportDto, CreditHistoryFilters, CreditTransactionDto, PagedResult } from "@/types/billing";

export const billingService = {
  /**
   * Get the current credit balance for a workspace.
   */
  getWorkspaceCredits: async (workspaceId: string): Promise<CreditBalanceDto> => {
    const { data } = await apiClient.get<CreditBalanceDto>(`/credits/workspace/${workspaceId}`);
    return data;
  },

  /**
   * Generate a billing report for a workspace for a specific month and year.
   */
  getBillingReport: async (workspaceId: string, month: number, year: number): Promise<BillingReportDto> => {
    const { data } = await apiClient.get<BillingReportDto>(`/credits/workspace/${workspaceId}/report`, {
      params: { month, year },
    });
    return data;
  },

  /**
   * Paginated credit transaction history for a workspace.
   */
  getCreditHistory: async (
    workspaceId: string,
    pageNumber = 1,
    pageSize = 20,
    filters?: CreditHistoryFilters
  ): Promise<PagedResult<CreditTransactionDto>> => {
    const params: any = { pageNumber, pageSize };

    if (filters) {
      if (filters.type && filters.type !== "ALL") params.type = filters.type;
      if (filters.fromDate) params.fromDate = filters.fromDate;
      if (filters.toDate) params.toDate = filters.toDate;
      if (filters.minAmount !== undefined) params.minAmount = filters.minAmount;
      if (filters.maxAmount !== undefined) params.maxAmount = filters.maxAmount;
    }

    const { data } = await apiClient.get<PagedResult<CreditTransactionDto>>(`/credits/workspace/${workspaceId}/history`, {
      params,
    });
    return data;
  },
  /**
   * Paginated global credit transaction history for admins.
   */
  getGlobalCreditHistory: async (
    pageNumber = 1,
    pageSize = 20,
    filters?: CreditHistoryFilters
  ): Promise<PagedResult<CreditTransactionDto>> => {
    const params: any = { pageNumber, pageSize };

    if (filters) {
      if (filters.workspaceId) params.workspaceId = filters.workspaceId;
      if (filters.type && filters.type !== "ALL") params.type = filters.type;
      if (filters.fromDate) params.fromDate = filters.fromDate;
      if (filters.toDate) params.toDate = filters.toDate;
    }

    const { data } = await apiClient.get<PagedResult<CreditTransactionDto>>(`/credits/history/global`, { params });
    return data;
  },

  /**
   * Get global billing metrics for admins.
   */
  getGlobalMetrics: async (): Promise<import("@/types/billing").GlobalBillingMetricsDto> => {
    const { data } = await apiClient.get<import("@/types/billing").GlobalBillingMetricsDto>(`/credits/metrics/global`);
    return data;
  },

  /**
   * Get workspace usage chart data.
   */
  getWorkspaceUsageChart: async (workspaceId: string, year: number): Promise<import("@/types/billing").UsageChartDto> => {
    const { data } = await apiClient.get<import("@/types/billing").UsageChartDto>(`/credits/workspace/${workspaceId}/chart`, { params: { year } });
    return data;
  },

  /**
   * Get global usage chart data.
   */
  getGlobalUsageChart: async (year: number): Promise<import("@/types/billing").UsageChartDto> => {
    const { data } = await apiClient.get<import("@/types/billing").UsageChartDto>(`/credits/metrics/global/chart`, { params: { year } });
    return data;
  },

  /**
   * Get workspace usage breakdown (Donut).
   */
  getWorkspaceUsageBreakdown: async (workspaceId: string, days = 30): Promise<import("@/types/billing").UsageSummaryDto[]> => {
    const { data } = await apiClient.get<import("@/types/billing").UsageSummaryDto[]>(`/credits/workspace/${workspaceId}/breakdown`, { params: { days } });
    return data;
  },

  /**
   * Get global usage breakdown (Donut).
   */
  getGlobalUsageBreakdown: async (days = 30): Promise<import("@/types/billing").UsageSummaryDto[]> => {
    const { data } = await apiClient.get<import("@/types/billing").UsageSummaryDto[]>(`/credits/metrics/global/breakdown`, { params: { days } });
    return data;
  },

  /**
   * Get top workspaces by consumption.
   */
  getTopWorkspaces: async (days = 30, limit = 5): Promise<import("@/types/billing").TopWorkspaceDto[]> => {
    const { data } = await apiClient.get<import("@/types/billing").TopWorkspaceDto[]>(`/credits/metrics/global/top-workspaces`, { params: { days, limit } });
    return data;
  },

  /**
   * Manually adjust credits for a workspace (admin only).
   */
  adjustCredits: async (workspaceId: string, amount: number, reason: string): Promise<CreditTransactionDto> => {
    const { data } = await apiClient.post<CreditTransactionDto>(`/credits/workspace/${workspaceId}/adjust`, { amount, reason });
    return data;
  },
};
