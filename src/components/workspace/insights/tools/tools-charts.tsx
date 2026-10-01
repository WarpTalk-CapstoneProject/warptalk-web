"use client";

/**
 * The two chart panels of the Tools tab: tool calls by plugin (ranked bars with each plugin's
 * share) and outcomes per day (stacked columns with the day's success rate as a line on a %
 * axis). Both are counts of real audit rows in the period — see `lib/workspace/insights/tools-metrics`.
 */

import { useTranslations } from "next-intl";

import { BarList, type BarListRow } from "@/components/admin/charts/bar-list";
import { CHART_COLORS, ChartFigure, TimeSeriesChart } from "@/components/admin/charts/time-series-chart";
import type { InsightsSourceState } from "@/components/workspace/insights/insights-types";
import { ToolsChartBody, ToolsPanel } from "@/components/workspace/insights/tools/tools-chrome";
import type { ToolsFormatters } from "@/components/workspace/insights/tools/tools-format";
import { topPlugins, type ToolsMetrics } from "@/lib/workspace/insights/tools-metrics";

/** Status colours, not identities: green ran, amber was refused by policy, red did not run. */
const OUTCOME_COLORS = {
  succeeded: "var(--success)",
  blocked: "var(--warning)",
  problem: "var(--destructive)",
  rate: CHART_COLORS.primary,
} as const;

const TOP_PLUGINS = 6;

function callsFigure(metrics: ToolsMetrics, t: ReturnType<typeof useTranslations>): string {
  return metrics.capped ? t("figure.callsAtLeast", { count: metrics.calls }) : t("figure.calls", { count: metrics.calls });
}

export function ToolCallsByPluginPanel({
  state,
  format,
}: {
  state: InsightsSourceState<ToolsMetrics>;
  format: ToolsFormatters;
}) {
  const t = useTranslations("workspaceInsightsTools");
  return (
    <ToolsPanel chart title={t("byPlugin.title")}>
      <ToolsChartBody state={state} height={200} empty={t("byPlugin.empty")} isEmpty={(data) => data.calls === 0}>
        {(data) => {
          const top = topPlugins(data.byPlugin, TOP_PLUGINS);
          const rows: BarListRow[] = top.map((row) => {
            const label = row.key === null ? t("byPlugin.other") : row.label;
            const key = row.key ?? "__other";
            return {
              key,
              label,
              segments: [
                {
                  key,
                  label: t("byPlugin.callsSegment"),
                  value: row.calls,
                  ...(row.key === null ? { color: "var(--usage-service-other)" } : {}),
                },
              ],
            };
          });
          const caption = data.byPlugin
            .slice(0, 3)
            .map((plugin) => `${plugin.label} (${format.count(plugin.calls)})`)
            .join(" · ");
          return (
            <>
              <ChartFigure value={callsFigure(data, t)} caption={data.capped ? t("figure.cappedCaption", { top: caption }) : caption} />
              <BarList ariaLabel={t("byPlugin.title")} rows={rows} formatValue={format.count} showShare />
            </>
          );
        }}
      </ToolsChartBody>
    </ToolsPanel>
  );
}

export function ToolOutcomesPerDayPanel({
  state,
  format,
}: {
  state: InsightsSourceState<ToolsMetrics>;
  format: ToolsFormatters;
}) {
  const t = useTranslations("workspaceInsightsTools");
  const legend = [
    { key: "succeeded", label: t("outcomes.succeeded"), color: OUTCOME_COLORS.succeeded, line: false },
    { key: "blocked", label: t("outcomes.blocked"), color: OUTCOME_COLORS.blocked, line: false },
    { key: "problem", label: t("outcomes.problem"), color: OUTCOME_COLORS.problem, line: false },
    { key: "rate", label: t("outcomes.successRate"), color: OUTCOME_COLORS.rate, line: true },
  ];
  return (
    <ToolsPanel chart title={t("outcomes.title")}>
      <ToolsChartBody
        state={state}
        height={200}
        empty={t("outcomes.empty")}
        isEmpty={(data) => data.calls === 0 || data.days.length === 0}
      >
        {(data) => {
          const { days } = data;
          const caption = [
            t("outcomes.captionBlocked", { count: data.blocked }),
            t("outcomes.captionNeedsSetup", { count: data.needsSetup }),
            t("outcomes.captionFailed", { count: data.failed }),
            data.awaitingConfirmation > 0 ? t("outcomes.captionAwaiting", { count: data.awaitingConfirmation }) : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <>
              <ChartFigure
                value={
                  data.successRate === null
                    ? "—"
                    : t("outcomes.figure", { rate: format.percent(data.successRate) })
                }
                caption={caption}
              />
              <TimeSeriesChart
                variant="combo"
                stacked
                integer
                height={200}
                ariaLabel={t("outcomes.aria")}
                labels={days.map((day) => format.dayLabel(day.key))}
                titles={days.map((day) => format.dayTitle(day.key))}
                formatValue={format.count}
                formatAxisRight={format.percent}
                describeGap={(index) => (days[index]?.future ? t("outcomes.stillToCome") : t("outcomes.noCalls"))}
                tooltipFooter={(index) => {
                  const total = days[index]?.total;
                  return total === null || total === undefined ? null : t("outcomes.dayTotal", { count: total });
                }}
                series={[
                  { key: "succeeded", label: t("outcomes.succeeded"), color: OUTCOME_COLORS.succeeded, kind: "bar", axis: "left", values: days.map((d) => d.succeeded) },
                  { key: "blocked", label: t("outcomes.blocked"), color: OUTCOME_COLORS.blocked, kind: "bar", axis: "left", values: days.map((d) => d.blocked) },
                  { key: "problem", label: t("outcomes.problem"), color: OUTCOME_COLORS.problem, kind: "bar", axis: "left", values: days.map((d) => d.problem) },
                  {
                    key: "rate",
                    label: t("outcomes.successRate"),
                    color: OUTCOME_COLORS.rate,
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
