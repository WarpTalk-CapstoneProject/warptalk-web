/**
 * Contracts for the billing service's per-workspace admin analytics (WT-206) —
 * `~/api/v1/admin/billing/workspaces/{id}`. Routed under /admin/billing rather than
 * /admin/workspaces because the gateway forwards the latter to the workspace service.
 */

/**
 * `subscriptionFound: false` means the workspace was never set up for billing; the nullable
 * figures stay null in that case, so "not set up" reads differently from "set up with zero".
 */
export interface AdminWorkspaceCreditSummaryDto {
  subscriptionFound: boolean;
  creditsRemaining: number | null;
  creditsUsedThisCycle: number | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  planId: string | null;
}

export interface AdminWorkspaceUsagePointDto {
  date: string;
  creditsConsumed: number;
  events: number;
}

export interface AdminWorkspaceFeatureUsageDto {
  usageType: string;
  creditsConsumed: number;
  quantity: number;
  events: number;
}

export interface AdminWorkspaceAnalyticsDto {
  workspaceId: string;
  from: string;
  to: string;
  credits: AdminWorkspaceCreditSummaryDto;
  creditsConsumedInPeriod: number;
  creditsToppedUpInPeriod: number;
  /** Distinct rooms that produced a usage record — a billing figure, not a meeting count. */
  meetingsWithBillableUsage: number;
  distinctUsersBilled: number;
  consumptionSeries: AdminWorkspaceUsagePointDto[];
  featureBreakdown: AdminWorkspaceFeatureUsageDto[];
}

/** Signed amount straight from the ledger: negative = consumption, positive = top-up/credit. */
export interface AdminCreditTransactionDto {
  id: string;
  createdAt: string;
  type: string;
  description: string | null;
  referenceId: string | null;
  referenceType: string | null;
  amount: number;
  balanceAfter: number;
  currency: string | null;
  status: string;
}
