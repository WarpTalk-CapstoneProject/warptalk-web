/**
 * WT-692: the investor view on /admin/billing — growth first, credit consumption second.
 *
 * Built only from series the Insights endpoints already serve (revenueByMonth, usersByMonth,
 * workspacesByMonth, activeWorkspacesByMonth), all on the same six local months. Nothing is
 * derived that the server did not send: a month a source did not report is null ("—", a gap in a
 * line), never 0.
 */

import type {
  BillingInsightsDto,
  UsersInsightsDto,
  WorkspacesInsightsDto,
} from "../../types/admin-insights.ts";

export const GROWTH_MONTHS = 6;

export interface GrowthMonth {
  month: string;
  revenue: number | null;
  activeUsers: number | null;
  newUsers: number | null;
  totalUsers: number | null;
  activeWorkspaces: number | null;
  newWorkspaces: number | null;
  totalWorkspaces: number | null;
}

/**
 * The window every growth series covers: from the first local day of the month five months back
 * to now. The server's month series end with the month of `to`, so this makes them the last six
 * calendar months including this one (month to date).
 */
export function growthWindow(now: Date): { from: Date; to: Date } {
  const from = new Date(now.getFullYear(), now.getMonth() - (GROWTH_MONTHS - 1), 1);
  return { from, to: now };
}

/**
 * One row per month, keyed on the server's month keys. The axis is the union of whatever months
 * the sources sent, in order; a source that is missing (older backend, failed request) leaves its
 * columns null rather than zero.
 */
export function mergeGrowthMonths(sources: {
  billing?: Pick<BillingInsightsDto, "revenueByMonth" | "activeWorkspacesByMonth"> | null;
  users?: Pick<UsersInsightsDto, "usersByMonth"> | null;
  workspaces?: Pick<WorkspacesInsightsDto, "workspacesByMonth"> | null;
}): GrowthMonth[] {
  const months = new Set<string>();
  sources.billing?.revenueByMonth?.forEach((row) => months.add(row.month));
  sources.billing?.activeWorkspacesByMonth?.forEach((row) => months.add(row.month));
  sources.users?.usersByMonth?.forEach((row) => months.add(row.month));
  sources.workspaces?.workspacesByMonth?.forEach((row) => months.add(row.month));

  const revenue = new Map(sources.billing?.revenueByMonth?.map((r) => [r.month, r.revenue]) ?? []);
  const active = new Map(sources.billing?.activeWorkspacesByMonth?.map((r) => [r.month, r.activeWorkspaces]) ?? []);
  const users = new Map(sources.users?.usersByMonth?.map((r) => [r.month, r]) ?? []);
  const workspaces = new Map(sources.workspaces?.workspacesByMonth?.map((r) => [r.month, r]) ?? []);

  return [...months].sort().map((month) => ({
    month,
    revenue: revenue.has(month) ? (revenue.get(month) ?? null) : null,
    activeUsers: users.get(month)?.activeUsers ?? null,
    newUsers: users.get(month)?.newUsers ?? null,
    totalUsers: users.get(month)?.totalUsers ?? null,
    activeWorkspaces: active.has(month) ? (active.get(month) ?? null) : null,
    newWorkspaces: workspaces.get(month)?.newWorkspaces ?? null,
    totalWorkspaces: workspaces.get(month)?.totalWorkspaces ?? null,
  }));
}

/**
 * Growth of the last COMPLETE month over the one before it, as a percentage — the latest month is
 * month-to-date, so comparing it would always read as a collapse. Null when either side is
 * missing or the base is zero (growth from nothing is not a percentage).
 */
export function completedMonthGrowth(
  rows: GrowthMonth[],
  pick: (row: GrowthMonth) => number | null,
): { month: string; value: number | null; previous: number | null; percent: number | null } | null {
  if (rows.length < 3) return null;
  const last = rows[rows.length - 2];
  const before = rows[rows.length - 3];
  const value = pick(last);
  const previous = pick(before);
  const percent =
    value == null || previous == null || previous === 0 ? null : ((value - previous) / previous) * 100;
  return { month: last.month, value, previous, percent };
}
