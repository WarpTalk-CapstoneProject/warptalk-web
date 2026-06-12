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
};
