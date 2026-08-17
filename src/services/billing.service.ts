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
  WorkspaceUsageByMemberDto,
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
   * Who in this workspace has spent what (WT-413).
   *
   * Owner/Admin only — the endpoint carries the same RequireWorkspaceRole gate as the balance
   * and history endpoints, so a member calling this gets a 403 rather than a redacted list.
   */
  getUsageByMember: async (
    workspaceId: string,
    params?: { from?: string; to?: string },
  ): Promise<WorkspaceUsageByMemberDto> => {
    const { data } = await apiClient.get<WorkspaceUsageByMemberDto>(
      `/credits/workspace/${workspaceId}/usage-by-member`,
      { params },
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
   * WT-430 (Linear): every transaction the filter matches, paged until the server's own
   * totalCount is satisfied.
   *
   * The repository clamps pageSize to 200, so a single "give me 1000" call silently returned
   * the newest 200 rows — the export preview summed a fifth of the cycle (-252 credits) while
   * the server-aggregated service breakdown beside it said 1,615, and the XLSX shipped the
   * same truncated fifth. The clamp is right (it protects the DB); the export just has to
   * keep asking. Capped at 50 pages (10,000 rows) so a pathological cycle cannot loop forever
   * — if that cap is ever hit, totalCount still tells the caller the export is partial.
   */
  getAllCreditHistory: async (
    workspaceId: string,
    filters?: CreditHistoryFilters,
  ): Promise<PagedResult<CreditTransactionDto>> => {
    const pageSize = 200;
    const first = await billingService.getCreditHistory(workspaceId, 1, pageSize, filters);
    const items = [...first.items];
    const totalCount = first.totalCount ?? items.length;

    let page = 2;
    while (items.length < totalCount && page <= 50) {
      const next = await billingService.getCreditHistory(workspaceId, page, pageSize, filters);
      if (next.items.length === 0) break;
      items.push(...next.items);
      page += 1;
    }

    return { items, totalCount };
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
   * Get workspace usage breakdown.
   *
   * `FeatureAdoptionDto`, not `UsageSummaryDto`: the per-workspace endpoint returns
   * `IEnumerable<FeatureAdoptionDto>`, which carries `usageCount` on top of the credits. The
   * declared return type said otherwise while the request generic below already said the truth,
   * so a caller reading `usageCount` was told the field did not exist on data that always has it.
   */
  getWorkspaceUsageBreakdown: async (
    workspaceId: string,
    days = 30,
  ): Promise<import("@/types/billing").FeatureAdoptionDto[]> => {
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

  /** Whether this workspace runs past zero credits, and how far its plan lets it. */
  getOverageSetting: async (
    workspaceId: string,
  ): Promise<import("@/types/billing").WorkspaceOverageSettingDto> => {
    const { data } = await apiClient.get<
      import("@/types/billing").WorkspaceOverageSettingDto
    >(`/subscriptions/workspace/${workspaceId}/overage`);
    return data;
  },

  /**
   * Turn it on or off. The server refuses `true` on a plan with no allowance rather than
   * accepting it as a no-op, so the error is worth showing verbatim.
   */
  setOverage: async (
    workspaceId: string,
    enabled: boolean,
  ): Promise<import("@/types/billing").WorkspaceOverageSettingDto> => {
    const { data } = await apiClient.put<
      import("@/types/billing").WorkspaceOverageSettingDto
    >(`/subscriptions/workspace/${workspaceId}/overage`, { enabled });
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
  /**
   * The customer catalogue: active plans only (BR-74).
   *
   * The server filters now. It did not, so a plan an administrator had deactivated stayed
   * selectable on the landing page and in every checkout flow — right up to the point where
   * SubscriptionService refused to create the subscription.
   */
  getPlans: async (): Promise<import("@/types/billing").PlanDto[]> => {
    const { data } =
      await apiClient.get<import("@/types/billing").PlanDto[]>(`/plans`);
    return data;
  },

  /**
   * Every plan, deactivated ones included. System Admin only — the route is authorized.
   *
   * The plan-management page must NOT use `getPlans`: deactivating a plan through the edit form
   * would drop it out of the only list that page has, and there would be no way to switch it back
   * on. Deactivation would be a one-way door.
   */
  getAllPlansForAdmin: async (): Promise<import("@/types/billing").PlanDto[]> => {
    const { data } =
      await apiClient.get<import("@/types/billing").PlanDto[]>(`/plans/all`);
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

  /*
   * WT-381 — `changeSubscription` used to live here and PUT
   * `/subscriptions/workspace/{id}/change-plan`. That route does not exist in the billing service
   * and never did, so the call 404'd for every workspace that had a subscription, which is every
   * workspace that could reach it.
   *
   * There is no replacement to write, because the working path was already here. A payment for a
   * different plan sets `Subscription.PlanId` in SubscriptionPaymentEventHandler — so
   * `createCheckoutSession` above IS the plan change, and the plans page routes through it.
   */

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

  // getServiceRates is gone: it called /usages/rates, a route that never existed (the real one
  // is /usages/rate-card), so the card it fed rendered zeros forever. Rate cards live on
  // /admin/plans now, where they are editable.
};
