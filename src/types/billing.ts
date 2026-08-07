export interface CreditBalanceDto {
  workspaceId: string;
  currentCredits: number;
  creditsUsedThisCycle: number;
  totalCredits: number;
  status: string;
  currentPeriodStart: string; // ISO datetime
  currentPeriodEnd: string; // ISO datetime
}

export interface SubscriptionDto {
  id: string;
  userId: string;
  workspaceId: string | null;
  planId: string;
  planName: string;
  price: number;
  status: string;
  creditsRemaining: number;
  creditsUsedThisCycle: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  cancelledAt: string | null;
  workspaceName?: string | null;
}

export interface CreateCheckoutSessionRequest {
  userId: string;
  workspaceId: string;
  amount: number;
  currency: string;
  paymentType: string;
  planSlug?: string;
  billingCycle?: string;
}

export interface CheckoutSessionDto {
  id: string;
  status: string;
  paymentStatus?: string;
  customerEmail?: string | null;
  amountTotal?: number | null;
  currency?: string | null;
  paymentIntentId?: string | null;
  metadata?: Record<string, string>;
}

export interface PlanDto {
  id: string;
  name: string;
  slug: string;
  description?: string;
  tier: string;
  price: number;
  currency: string;
  billingCycle: string;
  creditsPerCycle: number;
  features: string;
  sortOrder: number;
  isActive: boolean;
  maxParticipants: number;
  maxLanguages: number;
  voiceCloneEnabled: boolean;
  aiAssistantEnabled: boolean;
  glossaryEnabled: boolean;
  dedicatedGpu: boolean;
}

export type PlanMutationDto = Omit<PlanDto, "id">;

export interface CreditTransactionDto {
  id: string;
  workspaceId: string;
  workspaceName?: string | null;
  userId: string;
  userName?: string | null;
  amount: number; // negative = consumption, positive = top-up
  /**
   * Server-side values, verbatim from `TransactionConstants.TransactionTypes`. The consume
   * case was spelled "consumption" here and never matched anything the API sends, which is
   * why Total Consumed read 0 and the Consumption filter came back empty.
   */
  type: "consume" | "top_up" | "adjustment";
  description?: string;
  referenceType?: string;
  referenceId?: string;
  balanceAfter: number;
  createdAt: string; // ISO datetime
}

/**
 * Mirrors the billing service's `UsageSummaryDto` — the shape returned by the *global*
 * usage-breakdown endpoint.
 */
export interface UsageSummaryDto {
  usageType: string;
  totalCreditsConsumed: number;
}

/** Mirrors `FeatureAdoptionDto` — the per-workspace usage-breakdown endpoint. */
export interface FeatureAdoptionDto extends UsageSummaryDto {
  usageCount: number;
}

/**
 * Mirrors `UsageBreakdownDto` — the rows nested inside a `BillingReportDto`. Deliberately
 * NOT `UsageSummaryDto`: the report nests a different record whose credit field is
 * `creditsConsumed`, not `totalCreditsConsumed`. Typing both as one interface is what let
 * `usage.totalCreditsConsumed.toLocaleString()` compile and then throw on the first
 * workspace with any usage at all.
 */
export interface UsageBreakdownDto {
  usageType: string;
  creditsConsumed: number;
  quantity: number;
}

export interface BillingReportDto {
  workspaceId: string;
  month: number;
  year: number;
  startingBalance: number;
  endingBalance: number;
  totalTopUpCredits: number;
  totalConsumedCredits: number;
  usageBreakdown: UsageBreakdownDto[];
  // Both are nullable on the wire (`decimal?` / `int?`) when the month has nothing to
  // average over. The per-100-chars name is the server's; "PerMinute" never existed there.
  averageTranslationCostPer100Chars: number | null;
  averageCostPerMeeting: number | null;
}

export interface PagedResult<T> {
  totalCount: number;
  items: T[];
}

export interface CreditHistoryFilters {
  workspaceId?: string;
  type?: string;
  fromDate?: string;
  toDate?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface CreditHistoryQueryParams extends CreditHistoryFilters {
  pageNumber: number;
  pageSize: number;
}

export interface GroupedCreditTransaction extends CreditTransactionDto {
  originalTx: CreditTransactionDto[];
  isGrouped?: boolean;
}

export interface UsageGroupSummary {
  count: number;
  cost: number;
  rawType: string;
}

export interface GlobalBillingMetricsDto {
  totalBalance: number;
  monthlyUsage: number;
  auditEventsLast30Days: number;
  activeWorkspaces: number;
}

export interface MonthlyUsagePoint {
  month: number;
  monthName: string;
  consumedCredits: number;
  topUpCredits: number;
}

export interface UsageChartDto {
  year: number;
  monthlyData: MonthlyUsagePoint[];
}

export interface TopWorkspaceDto {
  workspaceId: string;
  workspaceName: string | null;
  totalCreditsConsumed: number;
}

export interface InvoiceDto {
  id: string;
  workspaceId: string;
  subscriptionId: string;
  paymentId: string;
  stripeInvoiceId: string;
  amount: number;
  currency: string;
  status: string;
  invoicePdfUrl: string;
  hostedInvoiceUrl: string;
  createdAt: string;
  workspaceName?: string | null;
}

export interface UsageAlertDto {
  workspaceId: string;
  workspaceName: string;
  consumedCreditsIn24h: number;
  reason: string;
}

export interface ServiceRatesDto {
  sttPerMinute: number;
  translationPerMinute: number;
  standardTtsPerMinute: number;
  voiceClonePerMinute: number;
  aiSummaryPerRequest: number;
  aiChatPerRequest: number;
}
