/**
 * Contracts for the platform admin Insights page (`/admin`).
 *
 * Mirrors the shared API contract agreed on 2026-09-17 for five endpoints, all system-admin only:
 *
 *   GET /admin/billing/insights?from&to&compare
 *   GET /admin/billing/insights/snapshot
 *   GET /admin/users/insights?from&to&compare
 *   GET /admin/workspaces/insights?from&to&compare
 *   GET /admin/meetings/insights?from&to&compare
 *
 * Dates are ISO-8601 UTC. `from` is inclusive, `to` exclusive. Money is VND.
 *
 * A metric's `value` or `previous` may be null when the server cannot compute it honestly; `note`
 * then says why. The page renders null as "—", never as 0.
 */

export type InsightsCompare = "previous" | "previousMonth";

export type InsightsUnit = "money" | "count" | "credits" | "hours" | "percent";

export interface InsightsRange {
  from: string;
  to: string;
}

export interface InsightsMetric {
  id: string;
  value: number | null;
  previous: number | null;
  unit: InsightsUnit;
  higherIsBetter: boolean;
  note: string | null;
}

export interface InsightsQuery {
  from: string;
  to: string;
  compare: InsightsCompare;
}

interface PeriodEnvelope {
  range: InsightsRange;
  previousRange: InsightsRange;
  metrics: InsightsMetric[];
}

// ── 1 · Billing, period ──────────────────────────────────────────────────────

export type BillingInsightsMetricId =
  | "revenue"
  | "payments"
  | "failedPayments"
  | "newSubscriptions"
  | "cancelledSubscriptions"
  | "creditsConsumed"
  | "overageCredits"
  | "aiProviderCost"
  | "grossMargin"
  | "revenuePerPayment";

export interface BillingInsightsDto extends PeriodEnvelope {
  generatedAt: string;
  /** Every day in range, zero-filled. `date` is YYYY-MM-DD. */
  revenueByDay: { date: string; revenue: number }[];
  /** The 6 calendar months ending with the month of `to`. `month` is YYYY-MM. */
  revenueByMonth: { month: string; revenue: number }[];
  creditsByService: { usageType: string; credits: number }[];
  /** Top 5 by credits consumed in range. */
  topWorkspaces: { workspaceId: string; workspaceName: string; credits: number }[];
}

// ── 2 · Billing, snapshot ("right now") ──────────────────────────────────────

export interface BillingSnapshotDto {
  generatedAt: string;
  revenueToday: number;
  revenueYesterday: number;
  mrr: number;
  mrrNote: string | null;
  activeSubscriptions: number;
  activeByCycle: { monthly: number; yearly: number; other: number };
  churnRateMonth: { cancelled: number; atMonthStart: number; rate: number };
  trials: number;
  trialsEndingThisWeek: number;
  pastDue: number;
  suspended: number;
  activeWorkspaces: number;
  platformCreditBalance: number;
  outstandingInvoices: {
    count: number;
    amount: number;
    pastDueCount: number;
    oldestPastDueDays: number | null;
    oldestPastDueWorkspace: string | null;
  };
  openSalesLeads: number;
  subscriptionsByPlan: {
    planSlug: string;
    planName: string;
    active: number;
    trial: number;
    pastDue: number;
  }[];
  /** Newest 8 across all workspaces. */
  recentPayments: {
    workspaceId: string;
    workspaceName: string;
    amount: number;
    currency: string;
    status: string;
    method: string | null;
    at: string;
  }[];
  /** Period end within 14 days. */
  endingSoon: {
    workspaceId: string;
    workspaceName: string;
    planName: string;
    endsAt: string;
    cancelAtPeriodEnd: boolean;
  }[];
  highUsageAlerts: { workspaceId: string; workspaceName: string; credits24h: number }[];
}

// ── 3 · Auth ─────────────────────────────────────────────────────────────────

export interface UsersInsightsDto extends PeriodEnvelope {
  newUsersByDay: { date: string; count: number }[];
}

// ── 4 · Workspace ────────────────────────────────────────────────────────────

export interface WorkspacesInsightsDto extends PeriodEnvelope {
  suspendedNow: number;
}

// ── 5 · Translation-room ─────────────────────────────────────────────────────

export interface MeetingsInsightsDto extends PeriodEnvelope {
  meetingsByDay: { date: string; meetings: number; hours: number }[];
  liveNow: number;
  startedToday: number;
}
