import apiClient from "@/lib/api/client";
import type {
  CreditBalanceDto,
  BillingReportDto,
  CreditHistoryFilters,
  CreditHistoryQueryParams,
  CreditTransactionDto,
  PagedResult,
  SubscriptionDto,
  InvoiceDto,
  UsageAlertDto,
  TopWorkspaceDto,
  UsageChartDto,
  PlanMutationDto,
  CheckoutSessionDto,
  CreateCheckoutSessionRequest,
} from "@/types/billing";

export const billingService = {
  /**
   * Get the current credit balance for a workspace.
   */
  getWorkspaceCredits: async (
    workspaceId: string,
  ): Promise<CreditBalanceDto> => {
    const { data } = await apiClient.get<CreditBalanceDto>(
      `/credits/workspace/${workspaceId}`,
    );
    return data;
  },

  /**
   * Generate a billing report for a workspace for a specific month and year.
   */
  getBillingReport: async (
    workspaceId: string,
    month: number,
    year: number,
  ): Promise<BillingReportDto> => {
    const { data } = await apiClient.get<BillingReportDto>(
      `/usages/workspace/${workspaceId}/report`,
      {
        params: { month, year },
      },
    );
    return data;
  },

  /**
   * Paginated credit transaction history for a workspace.
   */
  getCreditHistory: async (
    workspaceId: string,
    pageNumber = 1,
    pageSize = 20,
    filters?: CreditHistoryFilters,
  ): Promise<PagedResult<CreditTransactionDto>> => {
    const params: CreditHistoryQueryParams = { pageNumber, pageSize };

    if (filters) {
      if (filters.type && filters.type !== "ALL") params.type = filters.type;
      if (filters.fromDate) params.fromDate = filters.fromDate;
      if (filters.toDate) params.toDate = filters.toDate;
      if (filters.minAmount !== undefined) params.minAmount = filters.minAmount;
      if (filters.maxAmount !== undefined) params.maxAmount = filters.maxAmount;
    }

    const { data } = await apiClient.get<PagedResult<CreditTransactionDto>>(
      `/credits/workspace/${workspaceId}/history`,
      {
        params,
      },
    );
    return data;
  },
  /**
   * Paginated global credit transaction history for admins.
   */
  getGlobalCreditHistory: async (
    pageNumber = 1,
    pageSize = 20,
    filters?: CreditHistoryFilters,
  ): Promise<PagedResult<CreditTransactionDto>> => {
    const params: CreditHistoryQueryParams = { pageNumber, pageSize };

    if (filters) {
      if (filters.workspaceId) params.workspaceId = filters.workspaceId;
      if (filters.type && filters.type !== "ALL") params.type = filters.type;
      if (filters.fromDate) params.fromDate = filters.fromDate;
      if (filters.toDate) params.toDate = filters.toDate;
      if (filters.minAmount !== undefined) params.minAmount = filters.minAmount;
      if (filters.maxAmount !== undefined) params.maxAmount = filters.maxAmount;
    }

    const { data } = await apiClient.get<PagedResult<CreditTransactionDto>>(
      `/credits/history/global`,
      { params },
    );
    return data;
  },

  /**
   * Get global billing metrics for admins.
   */
  getGlobalMetrics: async (): Promise<
    import("@/types/billing").GlobalBillingMetricsDto
  > => {
    const { data } = await apiClient.get<
      import("@/types/billing").GlobalBillingMetricsDto
    >(`/usages/metrics/global`);
    return data;
  },

  /**
   * Get workspace usage chart data.
   */
  getWorkspaceUsageChart: async (
    workspaceId: string,
    year: number,
  ): Promise<UsageChartDto> => {
    const { data } = await apiClient.get<UsageChartDto>(
      `/usages/workspace/${workspaceId}/chart`,
      { params: { year } },
    );
    return data;
  },

  /**
   * Get global usage chart data.
   */
  getGlobalUsageChart: async (year: number): Promise<UsageChartDto> => {
    const { data } = await apiClient.get<UsageChartDto>(
      `/usages/metrics/global/chart`,
      { params: { year } },
    );
    return data;
  },

  /**
   * Get workspace usage breakdown (Donut).
   */
  getWorkspaceUsageBreakdown: async (
    workspaceId: string,
    days = 30,
  ): Promise<import("@/types/billing").UsageSummaryDto[]> => {
    const { data } = await apiClient.get<
      import("@/types/billing").FeatureAdoptionDto[]
    >(`/usages/workspace/${workspaceId}/breakdown`, { params: { days } });
    return data;
  },

  /**
   * Get global usage breakdown (Donut).
   */
  getGlobalUsageBreakdown: async (
    days = 30,
  ): Promise<import("@/types/billing").UsageSummaryDto[]> => {
    const { data } = await apiClient.get<
      import("@/types/billing").UsageSummaryDto[]
    >(`/usages/metrics/global/breakdown`, { params: { days } });
    return data;
  },

  /**
   * Get top workspaces by consumption.
   */
  getTopWorkspaces: async (
    days = 30,
    limit = 5,
  ): Promise<TopWorkspaceDto[]> => {
    const { data } = await apiClient.get<TopWorkspaceDto[]>(
      `/usages/metrics/global/top-workspaces`,
      { params: { days, limit } },
    );
    return data;
  },

  /**
   * Manually adjust credits for a workspace (admin only).
   */
  adjustCredits: async (
    workspaceId: string,
    amount: number,
    reason: string,
  ): Promise<CreditTransactionDto> => {
    const { data } = await apiClient.post<CreditTransactionDto>(
      `/credits/workspace/${workspaceId}/adjust`,
      { amount, reason },
    );
    return data;
  },

  /**
   * Get the active subscription for a workspace.
   */
  getActiveSubscription: async (
    workspaceId: string,
  ): Promise<SubscriptionDto> => {
    const { data } = await apiClient.get<SubscriptionDto>(
      `/subscriptions/workspace/${workspaceId}`,
    );
    return data;
  },

  /**
   * Get paginated invoices for a workspace.
   */
  getWorkspaceInvoices: async (
    workspaceId: string,
    pageNumber = 1,
    pageSize = 20,
  ): Promise<PagedResult<InvoiceDto>> => {
    const { data } = await apiClient.get<PagedResult<InvoiceDto>>(
      `/invoices/workspace/${workspaceId}`,
      {
        params: { pageNumber, pageSize },
      },
    );
    return data;
  },

  /**
   * Get all active subscription plans from the backend.
   */
  getPlans: async (): Promise<import("@/types/billing").PlanDto[]> => {
    const { data } =
      await apiClient.get<import("@/types/billing").PlanDto[]>(`/plans`);
    return data;
  },

  createCheckoutSession: async (
    request: CreateCheckoutSessionRequest,
  ): Promise<string> => {
    const { data } = await apiClient.post<{ url: string }>(
      "/payments/checkout",
      request,
    );
    return data.url;
  },

  getCheckoutSession: async (
    sessionId: string,
  ): Promise<CheckoutSessionDto> => {
    const { data } = await apiClient.get<CheckoutSessionDto>(
      `/payments/checkout-session/${sessionId}`,
    );
    return data;
  },

  /**
   * Cancel the active subscription for a workspace at period end.
   */
  cancelSubscription: async (
    workspaceId: string,
    reason?: string,
  ): Promise<void> => {
    await apiClient.delete(`/subscriptions/workspace/${workspaceId}`, {
      data: { reason: reason ?? "User requested cancellation" },
    });
  },

  /**
   * Upgrade or downgrade the active subscription plan for a workspace.
   */
  changeSubscription: async (
    workspaceId: string,
    newPlanId: string,
  ): Promise<import("@/types/billing").SubscriptionDto> => {
    const { data } = await apiClient.put<
      import("@/types/billing").SubscriptionDto
    >(`/subscriptions/workspace/${workspaceId}/change-plan`, {
      workspaceId,
      planId: newPlanId,
    });
    return data;
  },

  /**
   * Create a new subscription plan (Admin only).
   */
  createPlan: async (
    plan: PlanMutationDto,
  ): Promise<import("@/types/billing").PlanDto> => {
    const { data } = await apiClient.post<import("@/types/billing").PlanDto>(
      `/plans`,
      plan,
    );
    return data;
  },

  /**
   * Update an existing subscription plan (Admin only).
   */
  updatePlan: async (
    id: string,
    plan: PlanMutationDto,
  ): Promise<import("@/types/billing").PlanDto> => {
    const { data } = await apiClient.put<import("@/types/billing").PlanDto>(
      `/plans/${id}`,
      plan,
    );
    return data;
  },

  /**
   * Deactivate a subscription plan (Admin only).
   */
  deactivatePlan: async (id: string): Promise<void> => {
    await apiClient.delete(`/plans/${id}`);
  },

  /**
   * Get all global invoices (Admin only)
   */
  getGlobalInvoices: async (
    pageNumber = 1,
    pageSize = 20,
  ): Promise<PagedResult<InvoiceDto>> => {
    const { data } = await apiClient.get<PagedResult<InvoiceDto>>(
      `/invoices/global`,
      {
        params: { pageNumber, pageSize },
      },
    );
    return data;
  },

  /**
   * Get all global subscriptions (Admin only)
   */
  getGlobalSubscriptions: async (
    pageNumber = 1,
    pageSize = 20,
  ): Promise<PagedResult<SubscriptionDto>> => {
    const { data } = await apiClient.get<PagedResult<SubscriptionDto>>(
      `/subscriptions/global`,
      {
        params: { pageNumber, pageSize },
      },
    );
    return data;
  },

  /**
   * Get usage alerts (Admin only)
   */
  getUsageAlerts: async (): Promise<UsageAlertDto[]> => {
    const { data } = await apiClient.get<UsageAlertDto[]>(
      `/usages/metrics/global/alerts`,
    );
    return data;
  },

  /**
   * Get current AI service credit rates (Admin only).
   */
  getServiceRates: async (): Promise<
    import("@/types/billing").ServiceRatesDto
  > => {
    const { data } =
      await apiClient.get<import("@/types/billing").ServiceRatesDto>(
        `/usages/rates`,
      );
    return data;
  },

};
