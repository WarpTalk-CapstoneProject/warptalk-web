"use client";

/**
 * Workspace Insights → Tools: what WarpBot's tools did in the selected period. WT-878, rebuilt on
 * the server's count in wave 4 (2026-10-01).
 *
 * Every figure comes from one read, `GET /assistant/workspaces/{id}/insights/tools?from&to`
 * (`useWorkspaceToolInsights`), which counts every call — built-in tools, web search and plugin
 * tools. The tab no longer pages the plugin audit log to count it; that log is the per-call record
 * on Plugin activity, which the table links to for "who to fix".
 *
 * Nothing is seeded or defaulted: no calls is "No calls yet" and a "—" success rate; a read that
 * fails is "Not available yet" on every panel. A window that starts before recording did says
 * "Recording since {date}" rather than letting the empty days read as quiet ones, and a period
 * longer than the server's 180 days says which 180 days it shows.
 *
 * Plugin labels come from the plugin catalog; when the catalog cannot be read the plugin's key and
 * the tool's humanised name are shown instead — the counts never wait on it.
 */

import { Info } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import type { InsightsSourceState, InsightsTabProps } from "@/components/workspace/insights/insights-types";
import { mapState } from "@/components/workspace/insights/overview-model";
import { ToolCallsPerDayPanel, ToolOutcomesPanel, type ToolsChartData } from "@/components/workspace/insights/tools/tools-charts";
import { toolsFormatters } from "@/components/workspace/insights/tools/tools-format";
import { ToolsSummaryLine } from "@/components/workspace/insights/tools/tools-summary-line";
import { ToolsTable, type ToolsTableData } from "@/components/workspace/insights/tools/tools-table";
import { useAssistantPlugins } from "@/hooks/use-assistant";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { useWorkspaceToolInsights } from "@/hooks/use-workspace-tool-insights";
import { WORKSPACE_INSIGHTS_TOOLS_PAGE_TYPE } from "@/lib/assistant/assistant-scope";
import {
  TOOL_INSIGHTS_MAX_DAYS,
  comparablePreviousCalls,
  previousWindowStart,
  recordingSinceNotice,
} from "@/lib/workspace/insights/tool-insights";
import { toolTableRows } from "@/lib/workspace/insights/tools-metrics";
import { toolsAssistantSnapshot } from "@/lib/workspace/insights/tools-assistant-snapshot";

function Notice({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-hairline bg-surface-1 px-4 py-2.5 text-[12px] text-ink-muted">
      <Info size={14} className="mt-px shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function ToolsTab({ workspaceId, workspaceSlug, period, timeZone, updatedAt }: InsightsTabProps) {
  const t = useTranslations("workspaceInsightsTools");
  const locale = useLocale();
  const format = useMemo(() => toolsFormatters(locale, timeZone), [locale, timeZone]);
  const { insights, range, refetch } = useWorkspaceToolInsights({ workspaceId, period });
  const pluginsQuery = useAssistantPlugins(workspaceId || null);
  const catalog = pluginsQuery.data;

  const chartState = useMemo<InsightsSourceState<ToolsChartData>>(
    () =>
      mapState(insights, (data) => ({
        insights: data,
        axisEndDay: period.axisEndDay,
        previousCalls: comparablePreviousCalls(data, previousWindowStart(range)),
      })),
    [insights, period.axisEndDay, range],
  );

  const webSearchLabel = t("sources.webSearch");
  const tableState = useMemo<InsightsSourceState<ToolsTableData>>(() => {
    const pluginLabel = (key: string) => catalog?.find((plugin) => plugin.key === key)?.label;
    const pluginToolLabel = (key: string, tool: string) =>
      catalog?.find((plugin) => plugin.key === key)?.tools?.find((candidate) => candidate.name === tool)?.label;
    return mapState(insights, (data) => ({
      rows: toolTableRows(data.byTool, { webSearch: webSearchLabel, pluginLabel, pluginToolLabel }),
      bySource: data.bySource,
      totalCalls: data.totals.calls,
    }));
  }, [insights, catalog, webSearchLabel]);

  // WarpBot answers this tab's starters from the same counts (tools-assistant-snapshot.ts). Not
  // registered while the read is loading or failed ("no calls" must mean no calls), nor while it is
  // re-reading behind the previous period's figures.
  const assistantSnapshot = useMemo(
    () =>
      insights.status === "ready" && !insights.refreshing
        ? toolsAssistantSnapshot({
            range,
            insights: insights.data,
            labels: {
              webSearch: webSearchLabel,
              pluginLabel: (key) => catalog?.find((plugin) => plugin.key === key)?.label,
              pluginToolLabel: (key, tool) =>
                catalog?.find((plugin) => plugin.key === key)?.tools?.find((candidate) => candidate.name === tool)?.label,
            },
          })
        : null,
    [insights, range, catalog, webSearchLabel],
  );
  useRegisterAssistantContext(
    assistantSnapshot ? { pageType: WORKSPACE_INSIGHTS_TOOLS_PAGE_TYPE, workspaceId, snapshot: assistantSnapshot } : null,
  );

  const since = insights.status === "ready" ? recordingSinceNotice(range.from, insights.data.recordingSince) : null;
  const nowMs = updatedAt > 0 ? updatedAt : period.to.getTime();

  return (
    <div className="flex flex-col gap-3.5">
      {range.clamped ? (
        <Notice>
          {t("notices.clamped", {
            days: TOOL_INSIGHTS_MAX_DAYS,
            from: format.date(range.from),
            to: format.date(new Date(range.to.getTime() - 1)),
          })}
        </Notice>
      ) : null}
      {since ? <Notice>{t("notices.recordingSince", { date: format.date(since) })}</Notice> : null}
      <ToolsSummaryLine
        state={insights}
        format={format}
        nowMs={nowMs}
        pluginsHref={workspaceSlug ? `/${workspaceSlug}/settings/plugins` : null}
      />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ToolCallsPerDayPanel state={chartState} format={format} />
        <ToolOutcomesPanel state={chartState} format={format} />
      </div>
      <ToolsTable
        state={tableState}
        format={format}
        nowMs={nowMs}
        activityHref={workspaceSlug ? `/${workspaceSlug}/settings/plugin-activity` : null}
        onRetry={refetch}
      />
    </div>
  );
}
