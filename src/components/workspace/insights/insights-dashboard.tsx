"use client";

/**
 * The workspace Insights page (WT-878): title, the Overview / Usage / Tools switch, the period bar,
 * then the active tab.
 *
 * One page instead of three places that each answered part of "where do the credits go"
 * (/dashboard, Settings → Usage, Settings → Plugin activity), in the platform Insights page's
 * grammar. Those pages stay where they are for now; this sits beside them.
 *
 * THE PERIOD IS SHARED, EXCEPT ON USAGE
 *   Overview and Tools read the period in the URL. Usage follows the billing cycle, which is the
 *   window the credits are granted and settled in, so the period bar is hidden there rather than
 *   shown doing nothing.
 *
 * WHO OWNS WHAT
 *   The route owns the URL and the clock. This shell owns the Overview's sources (so Export writes
 *   the same figures the cards print) and reads them only while Overview is the tab on screen. The
 *   Usage and Tools tabs fetch their own, keyed under `INSIGHTS_QUERY_ROOT`, which is what the
 *   "Updated" pulse reads.
 */

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import type { InsightsSourceState, InsightsTab, InsightsTabProps } from "@/components/workspace/insights/insights-types";
import { UpdatedPulse } from "@/components/workspace/insights/insights-primitives";
import { buildOverviewModel, overviewCsvFigures } from "@/components/workspace/insights/overview-model";
import { OverviewTab } from "@/components/workspace/insights/overview-tab";
import { PeriodBar, type PeriodChoice } from "@/components/workspace/insights/period-bar";
import { ToolsTab } from "@/components/workspace/insights/tools-tab";
import { UsageTab } from "@/components/workspace/insights/usage-tab";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { useInsightsUpdatedAt, useWorkspaceInsightsOverview } from "@/hooks/use-workspace-insights";
import { useWorkspaceToolInsights } from "@/hooks/use-workspace-tool-insights";
import type { ResolvedInsightsPeriod } from "@/lib/admin/insights-period";
import { WORKSPACE_INSIGHTS_PAGE_TYPE } from "@/lib/assistant/assistant-scope";
import { downloadBlob } from "@/lib/ui/download-blob";
import { insightsAssistantSnapshot } from "@/lib/workspace/insights/assistant-snapshot";
import { overviewCsv } from "@/lib/workspace/insights/overview-metrics";

export const INSIGHTS_TABS: readonly InsightsTab[] = ["overview", "usage", "tools"];

const SEGMENT =
  "inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap border-r border-hairline px-3 text-[13px] font-medium text-ink-muted transition-colors last:border-r-0 hover:bg-surface-2 hover:text-ink aria-pressed:bg-surface-3 aria-pressed:text-ink";

/** The export's row labels: the card each figure is printed on. */
const CSV_LABEL_KEYS: Record<string, string> = {
  creditsUsed: "periodCards.creditsUsed",
  meetingsHeld: "periodCards.meetingsHeld",
  hoursTranslated: "periodCards.hoursTranslated",
  toolCalls: "periodCards.toolCalls",
  toolSuccessRate: "periodCards.toolSuccessRate",
  activeMembers: "snapshot.activeMembers",
  avgCreditsPerMeeting: "more.avgCreditsPerMeeting",
  creditsPerActiveMember: "more.creditsPerActiveMember",
};

export interface InsightsDashboardProps {
  workspaceId: string;
  workspaceSlug: string;
  tab: InsightsTab;
  period: ResolvedInsightsPeriod;
  timeZone: string;
  /** The page's clock, epoch ms, advanced once a minute by the route. */
  nowMs: number;
  onChooseTab: (tab: InsightsTab) => void;
  onChoosePeriod: (choice: PeriodChoice) => void;
  /** A link to a tab that keeps the period. */
  tabHref: (tab: InsightsTab) => string;
}

export function InsightsDashboard(props: InsightsDashboardProps) {
  const t = useTranslations("workspaceInsights");
  const locale = useLocale();
  const { workspaceId, workspaceSlug, tab, period, timeZone, nowMs } = props;

  const updatedAt = useInsightsUpdatedAt(workspaceId);
  const sources = useWorkspaceInsightsOverview({ workspaceId, period, nowMs, enabled: tab === "overview" });
  // The Tools tab reads the same period through the same hook, so the two share one cached answer.
  const { insights: toolInsights } = useWorkspaceToolInsights({ workspaceId, period, enabled: tab === "overview" });
  const model = useMemo(() => buildOverviewModel(sources, toolInsights, period), [sources, toolInsights, period]);

  // WarpBot's starters on this page are answered from these figures, not from a tool (see
  // assistant-snapshot.ts). Overview only: the Usage and Tools tabs register their own, from the sources they read.
  const assistantSnapshot = useMemo(() => {
    if (tab !== "overview") return null;
    // A re-read behind data on screen (`refreshing`) still holds the PREVIOUS period's figures;
    // sending them under the new period's dates would be a wrong answer, so they wait for the read.
    const ready = <T,>(state: InsightsSourceState<T>) => (state.status === "ready" && !state.refreshing ? state.data : null);
    const settled = <T,>(state: InsightsSourceState<T>) => (state.status === "ready" ? state.data : undefined);
    const tools = ready(model.tools);
    const labels = new Map<string, string>();
    for (const plugin of ready(sources.workspacePlugins)?.inWorkspace ?? []) labels.set(plugin.key, plugin.label);
    for (const plugin of ready(sources.catalog) ?? []) labels.set(plugin.key, plugin.label);
    return insightsAssistantSnapshot({
      current: { from: period.from, to: period.to },
      previous: { from: period.previousFrom, to: period.previousTo },
      credits: ready(model.credits),
      meetings: ready(model.meetings),
      hours: ready(model.hours),
      toolCalls: ready(model.toolCalls),
      toolSuccessRate: ready(model.toolSuccessRate),
      tools: tools && {
        error: tools.totals.error,
        blocked: tools.totals.blocked,
        needsSetupPlugins: tools.needsSetupPlugins.map((key) => labels.get(key) ?? key),
      },
      activeMembers: ready(model.activeMembers),
      balance: settled(sources.balance),
      subscription: settled(sources.subscription),
      pendingRequests: ready(sources.workspacePlugins)?.pendingRequests.filter((request) => request.status === "pending").length,
      nowMs,
    });
  }, [tab, model, sources, period, nowMs]);
  useRegisterAssistantContext(
    assistantSnapshot ? { pageType: WORKSPACE_INSIGHTS_PAGE_TYPE, workspaceId, snapshot: assistantSnapshot } : null,
  );

  const tabProps: InsightsTabProps = { workspaceId, workspaceSlug, period, timeZone, updatedAt };

  const handleExport = () => {
    const csv = overviewCsv(overviewCsvFigures(model, (id) => t(CSV_LABEL_KEYS[id] as never)));
    // A byte-order mark so a spreadsheet opens the file as UTF-8.
    void downloadBlob(
      () => new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }),
      `warptalk-${workspaceSlug}-insights-${period.customFrom}-to-${period.customTo}.csv`,
    ).catch(() => undefined);
  };

  return (
    <div className="flex flex-col gap-3.5 text-ink">
      {/* No page title: the top bar and the sidebar already name the page (see page-chrome.tsx).
          The tabs open the page, with the freshness pulse opposite them. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={t("tabs.label")} className="inline-flex overflow-hidden rounded-lg border border-hairline bg-surface-1">
          {INSIGHTS_TABS.map((id) => (
            <button key={id} type="button" className={SEGMENT} aria-pressed={tab === id} onClick={() => props.onChooseTab(id)}>
              {t(`tabs.${id}`)}
            </button>
          ))}
        </div>
        <UpdatedPulse updatedAt={updatedAt} />
      </div>

      {tab === "usage" ? null : (
        // Keyed so the custom date drafts follow the URL after back/forward.
        <PeriodBar
          key={`${period.period}:${period.customFrom}:${period.customTo}`}
          period={period}
          onChoosePeriod={props.onChoosePeriod}
          onExport={tab === "overview" ? handleExport : undefined}
          locale={locale}
        />
      )}

      {tab === "overview" ? (
        <OverviewTab {...tabProps} sources={sources} model={model} nowMs={nowMs} tabHref={props.tabHref} />
      ) : tab === "usage" ? (
        <UsageTab {...tabProps} />
      ) : (
        <ToolsTab {...tabProps} />
      )}
    </div>
  );
}
