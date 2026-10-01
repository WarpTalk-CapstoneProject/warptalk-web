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

import type { InsightsTab, InsightsTabProps } from "@/components/workspace/insights/insights-types";
import { UpdatedPulse } from "@/components/workspace/insights/insights-primitives";
import { buildOverviewModel, overviewCsvFigures } from "@/components/workspace/insights/overview-model";
import { OverviewTab } from "@/components/workspace/insights/overview-tab";
import { PeriodBar, type PeriodChoice } from "@/components/workspace/insights/period-bar";
import { ToolsTab } from "@/components/workspace/insights/tools-tab";
import { UsageTab } from "@/components/workspace/insights/usage-tab";
import { useInsightsUpdatedAt, useWorkspaceInsightsOverview } from "@/hooks/use-workspace-insights";
import { useWorkspaceToolInsights } from "@/hooks/use-workspace-tool-insights";
import type { ResolvedInsightsPeriod } from "@/lib/admin/insights-period";
import { downloadBlob } from "@/lib/ui/download-blob";
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[22px] font-semibold leading-[1.25] tracking-[-0.4px]">{t("title")}</h1>
        <UpdatedPulse updatedAt={updatedAt} />
      </div>

      <div role="group" aria-label={t("tabs.label")} className="inline-flex self-start overflow-hidden rounded-lg border border-hairline bg-surface-1">
        {INSIGHTS_TABS.map((id) => (
          <button key={id} type="button" className={SEGMENT} aria-pressed={tab === id} onClick={() => props.onChooseTab(id)}>
            {t(`tabs.${id}`)}
          </button>
        ))}
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
