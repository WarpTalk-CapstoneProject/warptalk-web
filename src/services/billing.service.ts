import apiClient from "@/lib/api/client";
import type {
  CreditBalanceDto,
  BillingPolicyDto,
  BillingReportDto,
  CreditHistoryFilters,
  CreditTransactionDto,
  PagedResult,
  SubscriptionDto,
  InvoiceDto,
  UsageAlertDto,
  TopWorkspaceDto,
  UsageChartDto,
  UpdateBillingPolicyRequest,
  UpdateSubscriptionContractTermsRequest,
  PricingConfigDto,
  UpdatePricingConfigRequest,
  UsageRateCardDto,
  UpsertUsageRateCardRequest,
  PlanRequest,
  TrialSubscriptionRequest,
  CreateWorkspaceContractSubscriptionRequest,
  CheckoutSessionDto,
  CreateWorkspaceSalesInquiryRequest,
  SalesInquiryDto,
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
    const params: Record<string, string | number> = { pageNumber, pageSize };

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
    const params: Record<string, string | number> = { pageNumber, pageSize };

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
      import("@/types/billing").UsageSummaryDto[]
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

  markInvoicePaid: async (invoiceId: string): Promise<InvoiceDto> => {
    const { data } = await apiClient.post<InvoiceDto>(
      `/invoices/${invoiceId}/mark-paid`,
    );
    return data;
  },

  createInvoiceCheckout: async (
    invoiceId: string,
  ): Promise<{ url: string }> => {
    const { data } = await apiClient.post<{ url: string }>(
      `/invoices/${invoiceId}/checkout`,
    );
    return data;
  },

  getCheckoutSession: async (
    sessionId: string,
  ): Promise<CheckoutSessionDto> => {
    const { data } = await apiClient.get<CheckoutSessionDto>(
      `/payments/checkout-session/${encodeURIComponent(sessionId)}`,
    );
    return data;
  },

  createWorkspaceSalesInquiry: async (
    request: CreateWorkspaceSalesInquiryRequest,
  ): Promise<SalesInquiryDto> => {
    const { data } = await apiClient.post<SalesInquiryDto>(
      `/sales-inquiries/workspace`,
      request,
    );
    return data;
  },

  getWorkspaceSalesInquiries: async (
    workspaceId: string,
    pageNumber = 1,
    pageSize = 20,
  ): Promise<PagedResult<SalesInquiryDto>> => {
    const { data } = await apiClient.get<PagedResult<SalesInquiryDto>>(
      `/sales-inquiries/workspace/${workspaceId}`,
      {
        params: {
          page: pageNumber,
          pageSize,
        },
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

  /**
   * Cancel the active subscription for a workspace at period end.
   */
  cancelSubscription: async (
    workspaceId: string,
    reason?: string,
  ): Promise<void> => {
    await apiClient.delete(`/subscriptions/workspace/${workspaceId}`, {
      params: { reason: reason ?? "User requested cancellation" },
    });
  },

  createWorkspaceContractSubscription: async (
    request: CreateWorkspaceContractSubscriptionRequest,
  ): Promise<SubscriptionDto> => {
    const { data } = await apiClient.post<SubscriptionDto>(
      `/subscriptions/contract`,
      request,
    );
    return data;
  },

  createTrialSubscription: async (
    request: TrialSubscriptionRequest,
  ): Promise<SubscriptionDto> => {
    const { data } = await apiClient.post<SubscriptionDto>(
      `/subscriptions/trial`,
      request,
    );
    return data;
  },

  /**
   * Update enterprise contract terms for a workspace subscription (Admin only).
   */
  updateSubscriptionContractTerms: async (
    workspaceId: string,
    terms: UpdateSubscriptionContractTermsRequest,
  ): Promise<SubscriptionDto> => {
    const { data } = await apiClient.put<SubscriptionDto>(
      `/subscriptions/workspace/${workspaceId}/contract-terms`,
      terms,
    );
    return data;
  },

  resumeSubscription: async (
    workspaceId: string,
    reason?: string,
  ): Promise<SubscriptionDto> => {
    const { data } = await apiClient.post<SubscriptionDto>(
      `/subscriptions/workspace/${workspaceId}/resume`,
      { reason },
    );
    return data;
  },

  /**
   * Update an existing subscription plan (Admin only).
   */
  updatePlan: async (
    id: string,
    plan: PlanRequest,
  ): Promise<import("@/types/billing").PlanDto> => {
    const { data } = await apiClient.put<import("@/types/billing").PlanDto>(
      `/plans/${id}`,
      plan,
    );
    return data;
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

  getPricingConfig: async (): Promise<PricingConfigDto> => {
    const { data } = await apiClient.get<PricingConfigDto>(
      `/usages/pricing-config`,
    );
    return data;
  },

  updatePricingConfig: async (
    config: UpdatePricingConfigRequest,
  ): Promise<PricingConfigDto> => {
    const { data } = await apiClient.put<PricingConfigDto>(
      `/usages/pricing-config`,
      config,
    );
    return data;
  },

  getBillingPolicy: async (): Promise<BillingPolicyDto> => {
    const { data } = await apiClient.get<BillingPolicyDto>(`/billing-policy`);
    return data;
  },

  updateBillingPolicy: async (
    policy: UpdateBillingPolicyRequest,
  ): Promise<BillingPolicyDto> => {
    const { data } = await apiClient.put<BillingPolicyDto>(
      `/billing-policy`,
      policy,
    );
    return data;
  },

  getUsageRateCard: async (): Promise<UsageRateCardDto[]> => {
    const { data } =
      await apiClient.get<UsageRateCardDto[]>(`/usages/rate-card`);
    return data;
  },

  upsertUsageRateCard: async (
    rate: UpsertUsageRateCardRequest,
  ): Promise<UsageRateCardDto> => {
    const { data } = await apiClient.put<UsageRateCardDto>(
      `/usages/rate-card`,
      rate,
    );
    return data;
  },
};
