export interface CreditBalanceDto {
  workspaceId: string;
  currentCredits: number;
  creditsUsedThisCycle: number;
  totalCredits: number;
  status: string;
  currentPeriodStart: string; // ISO datetime
  currentPeriodEnd: string;   // ISO datetime
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

export interface PlanDto {
  id: string;
  name: string;
  slug: string;
  description: string;
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
  allowGlossary: boolean;
  advancedAcl: boolean;
  voiceCloneLimitMins: number;
}

export interface CreditTransactionDto {
  id: string;
  workspaceId: string;
  workspaceName?: string | null;
  userId: string;
  userName?: string | null;
  amount: number; // negative = consumption, positive = top-up
  type: 'consumption' | 'top_up' | 'reserve' | 'refund' | 'adjustment';
  description?: string;
  referenceType?: string;
  referenceId?: string;
  balanceAfter: number;
  createdAt: string; // ISO datetime
}

export interface UsageSummaryDto {
  usageType: string;
  totalCreditsConsumed: number;
}

export interface BillingReportDto {
  workspaceId: string;
  month: number;
  year: number;
  startingBalance: number;
  endingBalance: number;
  totalTopUpCredits: number;
  totalConsumedCredits: number;
  usageBreakdown: UsageSummaryDto[];
  averageTranslationCostPerMinute: number;
  averageCostPerMeeting: number;
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

export interface MonthlyUsageDto {
  month: number;
  monthName: string;
  consumedCredits: number;
  topUpCredits: number;
}

export interface UsageChartDto {
  year: number;
  monthlyData: MonthlyUsageDto[];
}

export interface ServiceRatesDto {
  sttPerMinute: number;
  translationPerMinute: number;
  standardTtsPerMinute: number;
  voiceClonePerMinute: number;
  aiSummaryPerRequest: number;
  aiChatPerRequest: number;
}
