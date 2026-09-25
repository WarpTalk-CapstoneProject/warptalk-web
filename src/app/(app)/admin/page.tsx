"use client";

/**
 * Insights — the platform admin landing page (owner's call, 2026-09-17).
 *
 * Replaces the hairline-sectioned Overview with the shape of the OpenBoox ERP "business insights"
 * page: a period bar in the URL, ten period cards that compare with the previous period, "right
 * now" snapshot and operations rows, charts, and the lists an operator acts on.
 *
 * WHAT IT READS
 *   Five insights endpoints (billing period + snapshot, users, workspaces, meetings), plus four that
 *   already served the portal: meeting counts, dead-lettered outbox events, new sales leads and
 *   System Health. The old Overview's two operator signals are kept, folded into "Needs attention":
 *   the suspended-workspaces banner (workspace directory, status=suspended) and the 24h usage
 *   alerts — the latter read from the old endpoint only while the snapshot is unavailable.
 *
 * ONE SOURCE FAILING NEVER TAKES THE PAGE DOWN
 *   The insights endpoints were built beside this page and may 404 on an older backend. Each query
 *   stands alone; an errored one becomes "Not available yet" on its own cards, never a zero and
 *   never an error screen. The view itself is `InsightsDashboard`, which the dev preview renders
 *   against fixtures.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { AdminPage } from "@/components/admin/admin-page-chrome";
import {
  InsightsDashboard,
  type PeriodChoice,
  type SourceState,
} from "@/components/admin/insights/insights-dashboard";
import { useAdminMeetingCounts } from "@/hooks/use-admin-meetings";
import {
  ADMIN_INSIGHTS_REFRESH_MS,
  useAdminBillingInsights,
  useAdminProfitAndLoss,
  useAdminBillingSnapshot,
  useAdminMeetingsInsights,
  useAdminUsersInsights,
  useAdminWorkspacesInsights,
} from "@/hooks/use-admin-insights";
import { useAdminOutboxDeadLetters } from "@/hooks/use-admin-outbox";
import { useAdminPlatformHealth } from "@/hooks/use-admin-platform-health";
import { useAdminSalesLeads } from "@/hooks/use-admin-sales-leads";
import { useAdminWorkspaceDirectory } from "@/hooks/use-admin-workspaces";
import {
  browserTimeZone,
  insightsQueryOf,
  insightsSearch,
  resolveInsightsPeriod,
} from "@/lib/admin/insights-period";
import { billingService } from "@/services/billing.service";

/** How many dead letters are read to count them. A full list shows as "100+". */
const DEAD_LETTER_LIMIT = 100;

/** The clock the period is resolved against, to the minute so the query key is stable. */
function minuteNow(): Date {
  const now = new Date();
  now.setSeconds(0, 0);
  return now;
}

function stateOf<T, R = T>(query: UseQueryResult<T>, select?: (data: T) => R): SourceState<R> {
  if (query.data !== undefined) {
    return {
      status: "ready",
      data: select ? select(query.data) : (query.data as unknown as R),
      refreshing: query.isPlaceholderData,
    };
  }
  return query.isError ? { status: "unavailable" } : { status: "loading" };
}

function InsightsRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // "Now" advances once a minute while the tab is visible, which moves a to-now range forward and
  // with it the query key — the period sources refresh on the same beat as the snapshot.
  const [now, setNow] = useState(minuteNow);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") setNow(minuteNow());
    };
    const timer = window.setInterval(tick, ADMIN_INSIGHTS_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const periodParam = searchParams.get("period");
  const monthParam = searchParams.get("month");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const period = useMemo(
    () =>
      resolveInsightsPeriod(
        { period: periodParam, month: monthParam, from: fromParam, to: toParam },
        now,
      ),
    [periodParam, monthParam, fromParam, toParam, now],
  );
  // The presets above are built on the browser's calendar; the server is told which one, so its
  // days, "today" and previousMonth begin where the admin's do (Asia/Ho_Chi_Minh for the team).
  const [timeZone] = useState(browserTimeZone);
  const query = useMemo(() => insightsQueryOf(period, timeZone), [period, timeZone]);

  const billing = useAdminBillingInsights(query);
  const snapshot = useAdminBillingSnapshot(timeZone);
  const users = useAdminUsersInsights(query);
  const workspaces = useAdminWorkspacesInsights(query);
  const meetings = useAdminMeetingsInsights(query);
  const pnl = useAdminProfitAndLoss(query);

  const meetingCounts = useAdminMeetingCounts();
  const deadLetters = useAdminOutboxDeadLetters(DEAD_LETTER_LIMIT, {
    refetchInterval: ADMIN_INSIGHTS_REFRESH_MS,
  });
  const newSalesLeads = useAdminSalesLeads(
    { page: 1, pageSize: 1, status: "new" },
    { refetchInterval: ADMIN_INSIGHTS_REFRESH_MS },
  );
  // Page size 1: only `total` is read.
  const suspendedWorkspaces = useAdminWorkspaceDirectory(
    { page: 1, pageSize: 1, status: "suspended" },
    { refetchInterval: ADMIN_INSIGHTS_REFRESH_MS },
  );
  const health = useAdminPlatformHealth();
  // The old Overview's alert feed. The snapshot carries the same list; this is read only while
  // the snapshot cannot be, so an older backend still shows its high-usage workspaces.
  const usageAlerts = useQuery({
    queryKey: ["global-usage-alerts"],
    queryFn: () => billingService.getUsageAlerts(),
    refetchInterval: ADMIN_INSIGHTS_REFRESH_MS,
    enabled: snapshot.isError && snapshot.data === undefined,
  });

  const updatedAt = Math.max(
    billing.dataUpdatedAt,
    snapshot.dataUpdatedAt,
    users.dataUpdatedAt,
    workspaces.dataUpdatedAt,
    meetings.dataUpdatedAt,
    pnl.dataUpdatedAt,
    meetingCounts.dataUpdatedAt,
    deadLetters.dataUpdatedAt,
    newSalesLeads.dataUpdatedAt,
    suspendedWorkspaces.dataUpdatedAt,
    health.dataUpdatedAt,
  );

  const onChoosePeriod = useCallback(
    (choice: PeriodChoice) => router.replace(`/admin?${insightsSearch(choice)}`, { scroll: false }),
    [router],
  );

  return (
    <InsightsDashboard
      period={period}
      onChoosePeriod={onChoosePeriod}
      updatedAt={updatedAt}
      billing={stateOf(billing)}
      snapshot={stateOf(snapshot)}
      users={stateOf(users)}
      workspaces={stateOf(workspaces)}
      meetings={stateOf(meetings)}
      pnl={stateOf(pnl)}
      meetingCounts={stateOf(meetingCounts)}
      deadLetters={stateOf(deadLetters)}
      deadLettersLimit={DEAD_LETTER_LIMIT}
      newSalesLeads={stateOf(newSalesLeads, (page) => page.totalCount)}
      suspendedWorkspaces={stateOf(suspendedWorkspaces, (page) => page.total)}
      usageAlerts={usageAlerts.isFetched || usageAlerts.data ? stateOf(usageAlerts) : { status: "loading" }}
      health={stateOf(health)}
    />
  );
}

export default function AdminInsightsPage() {
  return (
    <AdminPage>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-surface-2" />}>
        <InsightsRoute />
      </Suspense>
    </AdminPage>
  );
}
