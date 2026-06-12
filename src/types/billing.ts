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
  amount: number; // negative = consumption, positive = top-up
  type: "consumption" | "top_up" | "adjust" | string;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
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
  type?: string;
  fromDate?: string;
  toDate?: string;
  minAmount?: number;
  maxAmount?: number;
}
