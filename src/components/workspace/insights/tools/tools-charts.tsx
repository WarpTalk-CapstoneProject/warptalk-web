"use client";

/**
 * The two chart panels of the Tools tab: calls per day (columns stacked by source — built-in, web
 * search, plugin — with the day's success rate as a line on a % axis) and the outcomes split (one
 * ranked bar per outcome with its share). Both draw the server's counts as they come — see
 * `lib/workspace/insights/tools-metrics` — and never re-bucket or estimate.
 */

import { useTranslations } from "next-intl";

import { BarList, type BarListRow } from "@/components/admin/charts/bar-list";
import { ChartFigure, TimeSeriesChart } from "@/components/admin/charts/time-series-chart";
import type { InsightsSourceState } from "@/components/workspace/insights/insights-types";
import { ToolsChartBody, ToolsPanel } from "@/components/workspace/insights/tools/tools-chrome";
import type { ToolsFormatters } from "@/components/workspace/insights/tools/tools-format";
import { toolSuccessRate } from "@/lib/workspace/insights/tool-insights";
import { outcomeSplit, toolDaySeries, type ToolOutcomeKey, type ToolSourceKey } from "@/lib/workspace/insights/tools-metrics";
import type { WorkspaceToolInsightsDto } from "@/types/assistant-tool-insights";

/** Identity colours for where a call ran; the table's source chips use the same ones. */
export const TOOL_SOURCE_COLORS: Record<ToolSourceKey, string> = {
  builtin: "var(--viz-1)",
  webSearch: "var(--viz-2)",
  plugin: "var(--viz-3)",
  other: "var(--usage-service-other)",
};

const RATE_COLOR = "var(--viz-4)";

/** Status colours, not identities: green ran, red broke, amber someone must fix, grey a rule or a choice. */
const OUTCOME_COLORS: Record<ToolOutcomeKey, string> = {
  ok: "var(--success)",
  error: "var(--destructive)",
  needsSetup: "var(--warning)",
  blocked: "var(--usage-service-other)",
  declined: "var(--viz-5)",
  confirmationRequired: "var(--viz-1)",
};

export interface ToolsChartData {
  insights: WorkspaceToolInsightsDto;
  /** Exclusive end of the day axis when the period runs past today. */
  axisEndDay: string | null;
  /** The previous period's calls, or null when it is not a fair comparison. */
  previousCalls: number | null;
}

export function ToolCallsPerDayPanel({
  state,
  format,
}: {
  state: InsightsSourceState<ToolsChartData>;
  format: ToolsFormatters;
}) {
  const t = useTranslations("workspaceInsightsTools");
  const legend = [
    { key: "builtin", label: t("sources.builtin"), color: TOOL_SOURCE_COLORS.builtin, line: false },
    { key: "webSearch", label: t("sources.webSearch"), color: TOOL_SOURCE_COLORS.webSearch, line: false },
    { key: "plugin", label: t("sources.plugin"), color: TOOL_SOURCE_COLORS.plugin, line: false },
    { key: "rate", label: t("perDay.successRate"), color: RATE_COLOR, line: true },
  ];
  return (
    <ToolsPanel chart title={t("perDay.title")} subtitle={t("perDay.utcNote")}>
      <ToolsChartBody
        state={state}
        height={200}
        empty={t("perDay.empty")}
        isEmpty={(data) => data.insights.totals.calls === 0 || data.insights.byDay.length === 0}
      >
        {({ insights, axisEndDay, previousCalls }) => {
          const days = toolDaySeries(insights.byDay, axisEndDay);
          return (
            <>
              <ChartFigure
                value={t("perDay.figure", { count: insights.totals.calls })}
                caption={previousCalls === null ? null : t("perDay.previous", { count: previousCalls })}
              />
              <TimeSeriesChart
                variant="combo"
                stacked
                integer
                height={200}
                ariaLabel={t("perDay.aria")}
                labels={days.map((day) => format.dayLabel(day.key))}
                titles={days.map((day) => format.dayTitle(day.key))}
                formatValue={format.count}
                formatAxisRight={format.percent}
                describeGap={(index) => (days[index]?.future ? t("perDay.stillToCome") : t("perDay.noCalls"))}
                tooltipFooter={(index) => {
                  const total = days[index]?.total;
                  return total === null || total === undefined ? null : t("perDay.dayTotal", { count: total });
                }}
                series={[
                  { key: "builtin", label: t("sources.builtin"), color: TOOL_SOURCE_COLORS.builtin, kind: "bar", axis: "left", values: days.map((d) => d.builtin) },
                  { key: "webSearch", label: t("sources.webSearch"), color: TOOL_SOURCE_COLORS.webSearch, kind: "bar", axis: "left", values: days.map((d) => d.webSearch) },
                  { key: "plugin", label: t("sources.plugin"), color: TOOL_SOURCE_COLORS.plugin, kind: "bar", axis: "left", values: days.map((d) => d.plugin) },
                  {
                    key: "rate",
                    label: t("perDay.successRate"),
                    color: RATE_COLOR,
                    kind: "line",
                    axis: "right",
                    values: days.map((d) => d.successRate),
                    formatValue: format.percent,
                  },
                ]}
              />
              <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-ink-muted">
                {legend.map((item) => (
                  <span key={item.key} className="inline-flex items-center gap-1.5">
                    <i
                      aria-hidden
                      className={item.line ? "inline-block h-0.5 w-3 rounded-full" : "inline-block size-2 rounded-[2px]"}
                      style={{ background: item.color }}
                    />
                    {item.label}
                  </span>
                ))}
              </div>
            </>
          );
        }}
      </ToolsChartBody>
    </ToolsPanel>
  );
}

export function ToolOutcomesPanel({
  state,
  format,
}: {
  state: InsightsSourceState<ToolsChartData>;
  format: ToolsFormatters;
}) {
  const t = useTranslations("workspaceInsightsTools");
  return (
    <ToolsPanel chart title={t("outcomes.title")}>
      <ToolsChartBody state={state} height={200} empty={t("outcomes.empty")} isEmpty={(data) => data.insights.totals.calls === 0}>
        {({ insights }) => {
          const { totals } = insights;
          const rate = toolSuccessRate(totals);
          const rows: BarListRow[] = outcomeSplit(totals).map((row) => ({
            key: row.key,
            label: t(`outcomes.${row.key}`),
            segments: [{ key: row.key, label: t("outcomes.callsSegment"), value: row.calls, color: OUTCOME_COLORS[row.key] }],
          }));
          return (
            <>
              <ChartFigure
                value={rate === null ? "—" : t("outcomes.figure", { rate: format.percent(rate) })}
                caption={
                  totals.medianDurationMs === null
                    ? t("outcomes.noMedian")
                    : t("outcomes.medianCaption", { duration: format.duration(totals.medianDurationMs) })
                }
              />
              <BarList ariaLabel={t("outcomes.aria")} rows={rows} formatValue={format.count} showShare />
            </>
          );
        }}
      </ToolsChartBody>
    </ToolsPanel>
  );
}
