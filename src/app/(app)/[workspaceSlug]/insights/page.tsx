"use client";

/**
 * Workspace Insights — `/{slug}/insights?tab=overview|usage|tools&period=…` (WT-878).
 *
 * The route owns three things and hands the rest to `InsightsDashboard`:
 *
 *  - WHO MAY SEE IT. Owner and Admin, like Usage and Plugin activity, whose endpoints refuse a
 *    member outright (credit history, usage by member, the plugin audit log). A spinner until the
 *    role is known, so a member never sees a flash of cards that are about to 403.
 *  - THE URL. The tab and the period live in the query string, so a shared or refreshed link shows
 *    the same view. The period params are the platform Insights page's
 *    (`lib/admin/insights-period.ts`); switching tab keeps them, choosing a period keeps the tab.
 *  - THE CLOCK. "Now" advances once a minute while the tab is visible. For a to-now period that
 *    moves the window, and with it the query keys, so the period figures refresh on that beat.
 */

import { Lock, Spinner } from "@phosphor-icons/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { WorkspaceBody, WorkspacePage, WorkspaceSection } from "@/components/workspace/page-chrome";
import { InsightsDashboard, INSIGHTS_TABS } from "@/components/workspace/insights/insights-dashboard";
import type { InsightsTab } from "@/components/workspace/insights/insights-types";
import type { PeriodChoice } from "@/components/workspace/insights/period-bar";
import { INSIGHTS_REFRESH_MS } from "@/hooks/use-workspace-insights";
import { useWorkspaceRole, useWorkspaceRoleLoaded } from "@/hooks/use-workspace-role";
import { browserTimeZone, insightsSearch, resolveInsightsPeriod } from "@/lib/admin/insights-period";
import { useWorkspaceStore } from "@/stores/workspace-store";

/** The clock the period is resolved against, to the minute so the query keys are stable. */
function minuteNow(): Date {
  const now = new Date();
  now.setSeconds(0, 0);
  return now;
}

function tabOf(value: string | null): InsightsTab {
  return (INSIGHTS_TABS as readonly string[]).includes(value ?? "") ? (value as InsightsTab) : "overview";
}

/** The query string for a tab and the period params already in the URL. Overview is the default and is left out. */
function searchFor(tab: InsightsTab, periodSearch: string): string {
  const params = new URLSearchParams(periodSearch);
  params.delete("tab");
  if (tab !== "overview") params.set("tab", tab);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function periodSearchOf(searchParams: URLSearchParams): string {
  const params = new URLSearchParams();
  for (const key of ["period", "month", "from", "to"]) {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  }
  return params.toString();
}

function InsightsRoute() {
  const t = useTranslations("workspaceInsights");
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const storeSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const workspaceSlug = storeSlug || (params?.workspaceSlug as string) || "";
  const role = useWorkspaceRole();
  const roleLoaded = useWorkspaceRoleLoaded();
  const canView = role === "owner" || role === "admin";

  const [now, setNow] = useState(minuteNow);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") setNow(minuteNow());
    };
    const timer = window.setInterval(tick, INSIGHTS_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const tab = tabOf(searchParams.get("tab"));
  const periodParam = searchParams.get("period");
  const monthParam = searchParams.get("month");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const period = useMemo(
    () => resolveInsightsPeriod({ period: periodParam, month: monthParam, from: fromParam, to: toParam }, now),
    [periodParam, monthParam, fromParam, toParam, now],
  );
  const [timeZone] = useState(browserTimeZone);

  const basePath = `/${workspaceSlug}/insights`;
  const periodSearch = periodSearchOf(new URLSearchParams(searchParams.toString()));

  const tabHref = useCallback((next: InsightsTab) => `${basePath}${searchFor(next, periodSearch)}`, [basePath, periodSearch]);
  const onChooseTab = useCallback(
    (next: InsightsTab) => router.replace(tabHref(next), { scroll: false }),
    [router, tabHref],
  );
  const onChoosePeriod = useCallback(
    (choice: PeriodChoice) => router.replace(`${basePath}${searchFor(tab, insightsSearch(choice))}`, { scroll: false }),
    [router, basePath, tab],
  );

  if (!workspaceId) return null;

  if (!roleLoaded) {
    return (
      <WorkspacePage>
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
        </div>
      </WorkspacePage>
    );
  }

  if (!canView) {
    return (
      <WorkspacePage>
        <div className="flex flex-1 items-center justify-center px-4">
          <WorkspaceSection className="max-w-md text-center">
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <Lock className="h-6 w-6" />
              </div>
              <p className="text-[15px] font-semibold text-ink">{t("accessDenied.title")}</p>
              <p className="text-xs text-ink-muted">{t("accessDenied.description")}</p>
            </div>
          </WorkspaceSection>
        </div>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <WorkspaceBody className="pt-5">
        <div className="mx-auto w-full max-w-[1480px]">
          <InsightsDashboard
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            tab={tab}
            period={period}
            timeZone={timeZone}
            nowMs={now.getTime()}
            onChooseTab={onChooseTab}
            onChoosePeriod={onChoosePeriod}
            tabHref={tabHref}
          />
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  );
}

export default function WorkspaceInsightsPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-surface-2" />}>
      <InsightsRoute />
    </Suspense>
  );
}
