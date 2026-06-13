export interface CreditBalanceDto {
  workspaceId: string;
  currentCredits: number;
  creditsUsedThisCycle: number;
  status: string;
  currentPeriodStart: string; // ISO datetime
  currentPeriodEnd: string;   // ISO datetime
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
  workspaceName: string;
  consumedCredits: number;
}
