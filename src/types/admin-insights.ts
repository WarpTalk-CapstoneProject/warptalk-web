/**
 * Contracts for the platform admin Insights page (`/admin`).
 *
 * Mirrors the shared API contract agreed on 2026-09-17 for five endpoints, all system-admin only:
 *
 *   GET /admin/billing/insights?from&to&compare&tz
 *   GET /admin/billing/insights/snapshot?tz
 *   GET /admin/users/insights?from&to&compare&tz
 *   GET /admin/workspaces/insights?from&to&compare&tz
 *   GET /admin/meetings/insights?from&to&compare&tz
 *
 * Checked field by field against the C# response records of backend #420/#421 (camelCase, nulls
 * written as null), not against the first draft of the contract.
 *
 * Instants are ISO-8601 UTC. `from` is inclusive, `to` exclusive. Money is VND.
 *
 * TIME ZONE
 *   `tz` is an IANA id (the browser's own; the server defaults to Asia/Ho_Chi_Minh and 400s an
 *   unknown one). It never moves `from`/`to`; it decides where the server's days and months begin.
 *   Every per-day `date` (YYYY-MM-DD) and per-month `month` (YYYY-MM) is a LOCAL calendar key of that
 *   zone, so the page labels them as they are and never re-buckets instants itself.
 *
 * A metric's `value` or `previous` may be null when the server cannot compute it honestly; `note`
 * then says why. The page renders null as "—", never as 0. The same holds for every other nullable
 * figure below, each of which carries its own note field.
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
  /** IANA time zone the server buckets days and months in. */
  tz: string;
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
  /**
   * Every local day of `tz` the range touches, zero-filled. `date` is YYYY-MM-DD. `revenue` is null
   * for a day whose every payment was in a currency with no FX rate — see `revenueByDayNote`.
   */
  revenueByDay: { date: string; revenue: number | null }[];
  /** What `revenueByDay` left out; null when nothing. */
  revenueByDayNote: string | null;
  /** The 6 local calendar months of `tz` ending with the month of `to`. `month` is YYYY-MM. */
  revenueByMonth: { month: string; revenue: number | null }[];
  /** What `revenueByMonth` left out; null when nothing. */
  revenueByMonthNote: string | null;
  creditsByService: { usageType: string; credits: number }[];
  /** Top 5 by credits consumed in range. `workspaceName` is null when workspace-service could not resolve it. */
  topWorkspaces: { workspaceId: string; workspaceName: string | null; credits: number }[];
  /**
   * How this period's `aiProviderCost` priced dubbing. Null from a backend that predates the
   * Cartesia usage sync — the card then says nothing about the basis rather than claiming one.
   */
  aiProviderCostBasis?: AiProviderCostBasisDto | null;
  /**
   * WT-692: workspaces with at least one credit consumption in each of the same six months as
   * `revenueByMonth` — used the product, paid or not. Absent from an older backend.
   */
  activeWorkspacesByMonth?: { month: string; activeWorkspaces: number }[] | null;
}

/**
 * `basis` is `measured` (every UTC day of the period had synced Cartesia usage), `mixed` (some did)
 * or `estimated` (none did: rate-card seconds × an assumed 12.5 characters/s). `cartesiaCredits`
 * are the measured dubbing credits inside the period, UTC days at its edges pro-rated by hours.
 */
export interface AiProviderCostBasisDto {
  basis: "measured" | "mixed" | "estimated";
  measuredDays: number;
  estimatedDays: number;
  cartesiaCredits: number;
  cartesiaUsdPerCredit: number;
  syncStatus: CartesiaSyncStatus;
}

/**
 * `ok` · `disabled` (no admin key configured) · `error` (the last attempt failed) · `pending`
 * (configured, first sync since start not finished).
 */
export type CartesiaSyncStatus = "ok" | "disabled" | "error" | "pending";

// ── 2 · Billing, snapshot ("right now") ──────────────────────────────────────

export interface BillingSnapshotDto {
  generatedAt: string;
  /** The local day of `tz`, in VND. Null when every payment that day was in an unconvertible currency. */
  revenueToday: number | null;
  /** What `revenueToday` converted or left out; null when nothing. */
  revenueTodayNote: string | null;
  revenueYesterday: number | null;
  revenueYesterdayNote: string | null;
  /** Null when no active subscription's price could be converted to VND; `mrrNote` says why. */
  mrr: number | null;
  mrrNote: string | null;
  activeSubscriptions: number;
  activeByCycle: { monthly: number; yearly: number; other: number };
  /** The local calendar month of `tz`. `rate` is a percentage, null when nothing was active at month start. */
  churnRateMonth: { cancelled: number; atMonthStart: number; rate: number | null };
  trials: number;
  trialsEndingThisWeek: number;
  pastDue: number;
  suspended: number;
  activeWorkspaces: number;
  platformCreditBalance: number;
  outstandingInvoices: {
    count: number;
    /** VND; null when no outstanding invoice's currency could be converted. */
    amount: number | null;
    amountNote: string | null;
    pastDueCount: number;
    oldestPastDueDays: number | null;
    /** A workspace NAME; null when there is none past due or the name could not be resolved. */
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
  /** Newest 8 charges across all workspaces. `amount` is in the payment's own `currency`. */
  recentPayments: {
    /** Null for a payment with no subscription. */
    workspaceId: string | null;
    workspaceName: string | null;
    amount: number;
    currency: string;
    status: string;
    method: string;
    at: string;
  }[];
  /**
   * Paid (non-trial) subscriptions whose period ends within 14 days — the 8 SOONEST, soonest first.
   * `cancelAtPeriodEnd` is true when auto-renew is off or the subscription is already cancelled,
   * i.e. it will not renew.
   */
  endingSoon: {
    workspaceId: string;
    workspaceName: string | null;
    planName: string;
    endsAt: string;
    cancelAtPeriodEnd: boolean;
  }[];
  highUsageAlerts: { workspaceId: string; workspaceName: string | null; credits24h: number }[];
  /** Cartesia, measured by billing's usage sync. Absent from a backend that predates the sync. */
  cartesia?: CartesiaUsageDto | null;
}

/**
 * What billing's Cartesia usage sync has read from Cartesia's admin usage API.
 *
 * Cartesia buckets usage by UTC day, so "this month" and "today" are the UTC calendar month and day,
 * not the admin's tz. Both are null when nothing was synced for them. `remainingCredits` is always
 * null today: Cartesia's API reports usage only, never the balance — `remainingCreditsNote` says so.
 * `filteredToApiKey`: only the production TTS key is counted, not every key on the account.
 */
export interface CartesiaUsageDto {
  status: CartesiaSyncStatus;
  /** Why, for `disabled` / `error`. Never contains a key. */
  statusNote: string | null;
  filteredToApiKey: boolean;
  creditsThisMonth: number | null;
  creditsToday: number | null;
  remainingCredits: number | null;
  remainingCreditsNote: string | null;
  lastSyncedAt: string | null;
  lastAttemptAt: string | null;
  usdPerCredit: number;
}

// ── 3 · Auth ─────────────────────────────────────────────────────────────────

export interface UsersInsightsDto extends PeriodEnvelope {
  /** Local days of `tz`, zero-filled. */
  newUsersByDay: { date: string; count: number }[];
  /**
   * WT-692: the six local months ending with the month of `to`. `totalUsers` = accounts existing
   * at the month's end; `activeUsers` = signed in or refreshed a session that month. Absent from an
   * older backend.
   */
  usersByMonth?: { month: string; newUsers: number; totalUsers: number; activeUsers: number }[] | null;
  usersByMonthNote?: string | null;
}

// ── 4 · Workspace ────────────────────────────────────────────────────────────

export interface WorkspacesInsightsDto extends PeriodEnvelope {
  suspendedNow: number;
  /** WT-692: six local months; `totalWorkspaces` = existing at the month's end (suspended included). */
  workspacesByMonth?: { month: string; newWorkspaces: number; totalWorkspaces: number }[] | null;
}

// ── 5 · Translation-room ─────────────────────────────────────────────────────

export interface MeetingsInsightsDto extends PeriodEnvelope {
  /** Local days of `tz`, zero-filled; hours are split at local midnight. */
  meetingsByDay: { date: string; meetings: number; hours: number }[];
  liveNow: number;
  /** Since the start of the local day of `tz`. */
  startedToday: number;
}
