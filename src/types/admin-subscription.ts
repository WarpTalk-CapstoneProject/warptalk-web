/**
 * Contracts for the system-admin subscription directory.
 *
 * These mirror `~/api/v1/admin/subscriptions` in the Billing service.
 */

/** Mirrors SubscriptionConstants.SubscriptionStatuses. */
export type AdminSubscriptionStatus =
  | "pending"
  | "active"
  | "cancelled"
  | "expired"
  | "suspended";

export type AdminSubscriptionStatusFilter = "all" | AdminSubscriptionStatus;

export type AdminSubscriptionSort =
  | "period_end_asc"
  | "period_end_desc"
  | "created_desc"
  | "created_asc"
  | "credits_asc";

/**
 * An amount that always states its currency.
 *
 * The platform prices in VND and in USD, so a bare number here would be ambiguous — which is why
 * the server never sends one.
 */
export interface AdminMoney {
  amount: number;
  currency: string;
}

export interface AdminSubscriptionSummaryDto {
  id: string;
  workspaceId: string;
  status: AdminSubscriptionStatus;
  /** healthy | low_balance | in_overage | suspended. A suspended service can still be status=active. */
  serviceState: string;
  /** overage_cap | invoice_overdue | trial_ended, when the service is suspended. */
  suspendedReason: string | null;
  planName: string;
  planSlug: string;
  planTier: string;
  billingCycle: string;
  /**
   * This subscription's own contribution to recurring revenue, already resolved server-side:
   * contract price over plan price, yearly divided by twelve, in the currency it is really
   * denominated in.
   *
   * NULL while the subscription is not recurring — a trial, or cancelled. Null and zero are
   * different answers, and rendering null as "0" would understate a trial that becomes worth
   * 1,900,000 VND next week.
   */
  monthlyValue: AdminMoney | null;
  creditsRemaining: number;
  creditsUsedThisCycle: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  autoRenew: boolean;
  /** Set while the subscription is still inside its trial window. */
  trialEndsAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

/**
 * `monthlyRecurring` is a LIST, one entry per currency, and is never a single number: the only
 * exchange rate the platform holds is a seed constant nobody maintains, so a converted total
 * would be confidently wrong rather than obviously split.
 */
export interface AdminSubscriptionSummaryTotalsDto {
  monthlyRecurring: AdminMoney[];
  activeCount: number;
  trialCount: number;
  pastDueCount: number;
  cancelledCount: number;
  endingWithin14Days: number;
}

export interface AdminSubscriptionDirectoryQuery {
  page?: number;
  pageSize?: number;
  status?: AdminSubscriptionStatusFilter;
  planSlug?: string;
  sort?: AdminSubscriptionSort;
}
