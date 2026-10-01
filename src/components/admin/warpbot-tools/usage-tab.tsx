"use client";

/**
 * Usage: every WarpBot tool call on the platform in a window — built-in, web search and plugin —
 * from `GET /assistant/admin/insights/tools` (wave 4 contract 2d).
 *
 * The arithmetic (rates, health, deltas) is `lib/admin/warpbot-tools-usage.ts`; this file only
 * lays it out. Charts are the admin primitives (`components/admin/charts`). Only counts and
 * outcomes are shown: the endpoint carries no arguments, answers or callers, and neither does this.
 */

import { Info, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { UseQueryResult } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { BarList, type BarListRow } from "@/components/admin/charts/bar-list";
import { ChartEmpty, TimeSeriesChart } from "@/components/admin/charts/time-series-chart";
import {
  formatCount,
  formatDate,
  formatDateTime,
  formatDuration,
  formatRate,
  HealthBadge,
  knownSource,
  SOURCE_COLORS,
  SourceChip,
  toolDisplayName,
  UsagePanel,
  type KnownSource,
} from "@/components/admin/warpbot-tools/tool-format";
import { Button } from "@/components/ui/button";
import { useAdminWorkspaceNames } from "@/hooks/use-admin-warpbot-tools";
import { workspaceHref } from "@/lib/admin/insights-links";
import { dayKeyLabel } from "@/lib/admin/insights-period";
import {
  countDelta,
  dailySuccessPercents,
  failingMost,
  HEALTHY_RATE,
  overallSuccessRate,
  rateDeltaPoints,
  sortByHealth,
  TOOL_HEALTH_MIN_CALLS,
  toolHealth,
  toolSuccessRate,
  unhealthyToolCount,
  USAGE_PERIODS,
  windowPredatesRecording,
  type CountDelta,
  type UsagePeriod,
} from "@/lib/admin/warpbot-tools-usage";
import { cn } from "@/lib/utils";
import type { AdminToolInsightsDto } from "@/types/admin-warpbot-tools";

const SEGMENT =
  "inline-flex h-[30px] items-center whitespace-nowrap border-r border-hairline px-3 text-[12px] font-medium text-ink-muted transition-colors last:border-r-0 hover:bg-surface-2 hover:text-ink aria-pressed:bg-surface-3 aria-pressed:text-ink";

const CARD = "min-w-0 rounded-xl border border-hairline bg-surface-1 px-4 py-3.5";

const TOP_TOOLS = 10;

type SourceFilter = "all" | KnownSource;
const SOURCE_FILTERS: readonly SourceFilter[] = ["all", "builtin", "web_search", "plugin"];

const OUTCOME_COLORS = {
  ok: "var(--success)",
  blocked: "var(--muted-foreground)",
  needsSetup: "var(--warning)",
  confirmationRequired: "var(--viz-1)",
  declined: "var(--viz-4)",
  error: "var(--destructive)",
} as const;
type OutcomeKey = keyof typeof OUTCOME_COLORS;
const OUTCOME_KEYS = Object.keys(OUTCOME_COLORS) as OutcomeKey[];

function percentText(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

// ── small pieces ─────────────────────────────────────────────────────────────

function Card({
  label,
  value,
  sub,
  tone,
  loading,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: "warning" | "danger";
  loading?: boolean;
}) {
  return (
    <div className={CARD}>
      <div className="truncate text-[11px] font-medium uppercase tracking-[0.4px] text-ink-muted">{label}</div>
      <div
        className={cn(
          "mt-2 truncate text-[21px] font-semibold leading-[1.1] tracking-[-0.4px] tabular-nums",
          loading ? "animate-pulse text-ink-muted" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-destructive" : "text-ink",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-2 truncate text-[11px] tabular-nums text-ink-muted">{sub}</div> : null}
    </div>
  );
}

/** "▲ 18% from 40,860"; up is good for calls, so no colour judgement beyond the arrow. */
function CountDeltaLine({ delta, previous, goodWhenUp }: { delta: CountDelta; previous: number; goodWhenUp: boolean }) {
  const t = useTranslations("adminPlugins.warpbotTools.usage.cards");
  if (delta.kind === "none") return <span>{t("noPrevious")}</span>;
  if (delta.kind === "new") return <span>{t("newSincePrevious")}</span>;
  const up = delta.percent > 0;
  const flat = delta.percent === 0;
  const good = flat ? null : up === goodWhenUp;
  return (
    <span>
      <span className={cn(good === true && "font-semibold text-success", good === false && "font-semibold text-destructive")}>
        {flat ? "±0%" : `${up ? "▲" : "▼"} ${percentText(Math.abs(delta.percent))}`}
      </span>{" "}
      {t("fromPrevious", { value: formatCount(previous) })}
    </span>
  );
}

function RateDeltaLine({ points }: { points: number | null }) {
  const t = useTranslations("adminPlugins.warpbotTools.usage.cards");
  if (points === null) return <span>{t("noPrevious")}</span>;
  if (points === 0) return <span>{t("ratePointsFlat")}</span>;
  return (
    <span className={cn("font-semibold", points > 0 ? "text-success" : "text-destructive")}>
      {t("ratePoints", { arrow: points > 0 ? "▲" : "▼", points: Math.abs(points).toFixed(1) })}
    </span>
  );
}

// ── the tab ──────────────────────────────────────────────────────────────────

export function WarpbotToolsUsageTab({
  usage,
  period,
  windowFrom,
  onChoosePeriod,
  canReadWorkspaces,
}: {
  usage: UseQueryResult<AdminToolInsightsDto>;
  period: UsagePeriod;
  windowFrom: string;
  onChoosePeriod: (period: UsagePeriod) => void;
  canReadWorkspaces: boolean;
}) {
  const t = useTranslations("adminPlugins.warpbotTools.usage");
  const data = usage.data;
  const status = (usage.error as { response?: { status?: number } } | null)?.response?.status;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div role="group" aria-label={t("periodLabel")} className="inline-flex overflow-hidden rounded-lg border border-hairline bg-surface-1">
          {USAGE_PERIODS.map((value) => (
            <button key={value} type="button" className={SEGMENT} aria-pressed={period === value} onClick={() => onChoosePeriod(value)}>
              {t(`periods.${value}`)}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-ink-muted">{t(`comparison.${period}`)}</span>
      </div>

      {usage.isError && !data ? (
        <AdminPanel>
          <div className="flex items-start gap-3 px-4 py-8 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">{status === 404 ? t("unavailable.notYetTitle") : t("unavailable.title")}</p>
              <p className="mt-1 text-ink-muted">
                {status === 404 ? t("unavailable.notYetBody") : status === 403 ? t("unavailable.forbidden") : t("unavailable.body")}
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void usage.refetch()}>
                {t("unavailable.tryAgain")}
              </Button>
            </div>
          </div>
        </AdminPanel>
      ) : (
        <UsageBody data={data} loading={usage.isPending} refreshing={usage.isPlaceholderData} windowFrom={windowFrom} canReadWorkspaces={canReadWorkspaces} />
      )}
    </div>
  );
}

function UsageBody({
  data,
  loading,
  refreshing,
  windowFrom,
  canReadWorkspaces,
}: {
  data: AdminToolInsightsDto | undefined;
  loading: boolean;
  refreshing: boolean;
  windowFrom: string;
  canReadWorkspaces: boolean;
}) {
  const t = useTranslations("adminPlugins.warpbotTools.usage");
  const tSource = useTranslations("adminPlugins.warpbotTools.source");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const totals = data?.totals;
  const rate = totals ? overallSuccessRate(totals) : null;
  const failedTotal = totals ? totals.error : 0;
  const tools = useMemo(() => data?.byTool ?? [], [data]);
  const healthRows = useMemo(() => sortByHealth(tools), [tools]);
  const failing = useMemo(() => failingMost(tools, 5), [tools]);
  const workspaceIds = useMemo(() => (data?.byWorkspace ?? []).map((row) => row.workspaceId), [data]);
  const workspaceNames = useAdminWorkspaceNames(workspaceIds, canReadWorkspaces);
  const webSearchLabel = tSource("webSearch");
  const dash = "—";

  const days = data?.byDay ?? [];
  const dayLabels = days.map((day) => dayKeyLabel(day.date));

  const toolRows: BarListRow[] = tools
    .filter((row) => sourceFilter === "all" || knownSource(row.source) === sourceFilter)
    .sort((a, b) => b.calls - a.calls)
    .slice(0, TOP_TOOLS)
    .map((row) => {
      const source = knownSource(row.source);
      const name = toolDisplayName(row, webSearchLabel);
      return {
        key: `${row.source}:${row.pluginKey ?? ""}:${row.tool}`,
        label: source === "plugin" && row.pluginKey ? `${name} · ${row.pluginKey}` : name,
        segments: [{ key: "calls", label: t("charts.calls"), value: row.calls, color: SOURCE_COLORS[source] }],
      };
    });

  const outcomeValues: Record<OutcomeKey, number> = {
    ok: totals?.ok ?? 0,
    blocked: totals?.blocked ?? 0,
    needsSetup: totals?.needsSetup ?? 0,
    confirmationRequired: totals?.confirmationRequired ?? 0,
    declined: totals?.declined ?? 0,
    error: totals?.error ?? 0,
  };
  const outcomeTotal = OUTCOME_KEYS.reduce((sum, key) => sum + outcomeValues[key], 0);
  const outcomeRows: BarListRow[] = OUTCOME_KEYS.map((key) => ({
    key,
    label: t(`outcomes.${key}`),
    segments: [{ key, label: t(`outcomes.${key}`), value: outcomeValues[key], color: OUTCOME_COLORS[key] }],
  }));

  const showRecordingNotice = data ? windowPredatesRecording(data.from || windowFrom, data.recordingSince) : false;

  return (
    <div className={cn("flex flex-col gap-4", refreshing && "opacity-60 transition-opacity")}>
      {showRecordingNotice ? (
        <p className="flex items-start gap-2 rounded-lg border border-hairline bg-surface-1 px-3.5 py-2.5 text-[12px] text-ink-muted">
          <Info size={14} className="mt-0.5 shrink-0" />
          {data?.recordingSince
            ? t("recordingSince", { date: formatDate(data.recordingSince) })
            : t("recordingNothingYet")}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card
          label={t("cards.calls")}
          value={totals ? formatCount(totals.calls) : dash}
          loading={loading}
          sub={totals && data ? <CountDeltaLine delta={countDelta(totals.calls, data.previousPeriodCalls)} previous={data.previousPeriodCalls} goodWhenUp /> : null}
        />
        <Card
          label={t("cards.successRate")}
          value={formatRate(rate)}
          loading={loading}
          tone={rate !== null && rate < HEALTHY_RATE ? "warning" : undefined}
          sub={data ? <RateDeltaLine points={rateDeltaPoints(rate, data.previousSuccessRate)} /> : null}
        />
        <Card
          label={t("cards.failed")}
          value={totals ? formatCount(failedTotal) : dash}
          loading={loading}
          tone={failedTotal > 0 ? "danger" : undefined}
          sub={totals ? t("cards.failedSub") : null}
        />
        <Card
          label={t("cards.medianDuration")}
          value={formatDuration(totals?.medianDurationMs)}
          loading={loading}
          sub={totals ? t("cards.medianDurationSub") : null}
        />
        <Card
          label={t("cards.needsSetup")}
          value={totals ? formatCount(totals.needsSetup) : dash}
          loading={loading}
          sub={totals ? t("cards.needsSetupSub") : null}
        />
        <Card
          label={t("cards.blocked")}
          value={totals ? formatCount(totals.blocked) : dash}
          loading={loading}
          sub={totals ? t("cards.blockedSub") : null}
        />
        <Card
          label={t("cards.awaiting")}
          value={totals ? formatCount(totals.confirmationRequired + totals.declined) : dash}
          loading={loading}
          sub={totals ? t("cards.awaitingSub", { declined: formatCount(totals.declined) }) : null}
        />
        <Card
          label={t("cards.degraded")}
          value={data ? formatCount(unhealthyToolCount(tools)) : dash}
          loading={loading}
          tone={data && unhealthyToolCount(tools) > 0 ? "warning" : undefined}
          sub={data ? t("cards.degradedSub", { count: formatCount(tools.length) }) : null}
        />
      </div>

      <UsagePanel title={t("charts.perDay")}>
        {loading ? (
          <ChartEmpty height={220}>{t("loading")}</ChartEmpty>
        ) : days.length === 0 || (totals?.calls ?? 0) === 0 ? (
          <ChartEmpty height={220}>{t("charts.empty")}</ChartEmpty>
        ) : (
          <TimeSeriesChart
            variant="bar"
            stacked
            integer
            height={220}
            labels={dayLabels}
            series={[
              { key: "builtin", label: tSource("builtin"), color: SOURCE_COLORS.builtin, values: days.map((day) => day.builtin) },
              { key: "web_search", label: tSource("webSearch"), color: SOURCE_COLORS.web_search, values: days.map((day) => day.webSearch) },
              { key: "plugin", label: tSource("plugin"), color: SOURCE_COLORS.plugin, values: days.map((day) => day.plugin) },
            ]}
            formatValue={formatCount}
            tooltipFooter={(index) => {
              const day = days[index];
              return day ? t("charts.dayTotal", { calls: formatCount(day.builtin + day.webSearch + day.plugin) }) : null;
            }}
            ariaLabel={t("charts.perDayAria")}
          />
        )}
      </UsagePanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <UsagePanel
          title={t("charts.successRate")}
          aside={
            <span className="inline-flex items-center gap-1.5">
              <i aria-hidden className="inline-block h-2 w-3.5 rounded-[2px] border border-success bg-success/15" />
              {t("charts.target", { percent: Math.round(HEALTHY_RATE * 100) })}
            </span>
          }
        >
          {loading ? (
            <ChartEmpty height={180}>{t("loading")}</ChartEmpty>
          ) : days.length === 0 || (totals?.calls ?? 0) === 0 ? (
            <ChartEmpty height={180}>{t("charts.empty")}</ChartEmpty>
          ) : (
            <TimeSeriesChart
              variant="line"
              height={180}
              labels={dayLabels}
              series={[{ key: "rate", label: t("charts.successRate"), values: dailySuccessPercents(days) }]}
              band={{ from: HEALTHY_RATE * 100, to: 100 }}
              formatValue={(value) => percentText(Math.round(value * 10) / 10)}
              formatAxis={(value) => `${value}%`}
              describeGap={() => t("charts.noCalls")}
              tooltipFooter={(index) => {
                const day = days[index];
                return day && day.failed > 0 ? t("charts.dayFailed", { failed: formatCount(day.failed) }) : null;
              }}
              ariaLabel={t("charts.successRateAria")}
            />
          )}
        </UsagePanel>

        <UsagePanel title={t("charts.outcomes")} aside={t("charts.outcomesAside")}>
          {loading ? (
            <ChartEmpty height={180}>{t("loading")}</ChartEmpty>
          ) : outcomeTotal === 0 ? (
            <ChartEmpty height={180}>{t("charts.empty")}</ChartEmpty>
          ) : (
            <>
              <div className="mb-3 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
                {OUTCOME_KEYS.filter((key) => outcomeValues[key] > 0).map((key) => (
                  <span key={key} className="h-full" style={{ flexGrow: outcomeValues[key], flexBasis: 0, minWidth: 2, background: OUTCOME_COLORS[key] }} />
                ))}
              </div>
              <BarList ariaLabel={t("charts.outcomes")} rows={outcomeRows} formatValue={formatCount} showShare />
            </>
          )}
        </UsagePanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <UsagePanel
          title={t("charts.byTool")}
          aside={
            <div role="group" aria-label={t("charts.sourceFilter")} className="inline-flex overflow-hidden rounded-md border border-hairline">
              {SOURCE_FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={sourceFilter === value}
                  onClick={() => setSourceFilter(value)}
                  className="border-r border-hairline px-2 py-1 text-[11px] font-medium text-ink-muted last:border-r-0 hover:bg-surface-2 aria-pressed:bg-surface-3 aria-pressed:text-ink"
                >
                  {value === "all" ? t("charts.allSources") : tSource(value === "web_search" ? "webSearch" : value)}
                </button>
              ))}
            </div>
          }
        >
          {loading ? (
            <ChartEmpty height={160}>{t("loading")}</ChartEmpty>
          ) : toolRows.length === 0 ? (
            <ChartEmpty height={160}>{t("charts.empty")}</ChartEmpty>
          ) : (
            <BarList ariaLabel={t("charts.byTool")} rows={toolRows} formatValue={formatCount} />
          )}
        </UsagePanel>

        <UsagePanel title={t("failing.title")} aside={t("failing.aside", { min: TOOL_HEALTH_MIN_CALLS })}>
          {loading ? (
            <ChartEmpty height={160}>{t("loading")}</ChartEmpty>
          ) : failing.length === 0 ? (
            <ChartEmpty height={160}>{t("failing.none")}</ChartEmpty>
          ) : (
            <ul className="flex flex-col">
              {failing.map(({ row, failureRate }) => (
                <li key={`${row.source}:${row.pluginKey ?? ""}:${row.tool}`} className="flex items-baseline justify-between gap-3 border-b border-hairline/60 py-2 last:border-b-0">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] text-ink">{toolDisplayName(row, webSearchLabel)}</div>
                    <div className="truncate text-[11px] text-ink-muted">
                      {t("failing.detail", { errors: formatCount(row.error), ran: formatCount(row.ok + row.error) })}
                    </div>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-destructive">{formatRate(failureRate)}</span>
                </li>
              ))}
            </ul>
          )}
        </UsagePanel>
      </div>

      <UsagePanel title={t("health.title")} aside={t("health.aside", { min: TOOL_HEALTH_MIN_CALLS })}>
        {loading ? (
          <ChartEmpty height={120}>{t("loading")}</ChartEmpty>
        ) : healthRows.length === 0 ? (
          <ChartEmpty height={120}>{t("charts.empty")}</ChartEmpty>
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead>
                <tr className="border-b border-hairline/60 text-left text-[11px] text-ink-muted">
                  <th className="px-4 py-2 font-medium">{t("health.columns.tool")}</th>
                  <th className="px-4 py-2 font-medium">{t("health.columns.status")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("health.columns.calls")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("health.columns.success")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("health.columns.stopped")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("health.columns.median")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("health.columns.workspaces")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("health.columns.lastCalled")}</th>
                </tr>
              </thead>
              <tbody>
                {healthRows.map((row) => (
                  <tr key={`${row.source}:${row.pluginKey ?? ""}:${row.tool}`} className="border-b border-hairline/60 align-top last:border-b-0">
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">{toolDisplayName(row, webSearchLabel)}</span>
                        <SourceChip source={row.source} />
                      </div>
                      <code className="font-mono text-[11px] text-ink-muted">
                        {row.pluginKey ? `${row.pluginKey} · ${row.tool}` : row.tool}
                      </code>
                    </td>
                    <td className="px-4 py-2.5">
                      <HealthBadge health={toolHealth(row)} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCount(row.calls)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatRate(toolSuccessRate(row))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{formatCount(row.blocked + row.needsSetup)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{formatDuration(row.medianDurationMs)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{formatCount(row.workspaces)}</td>
                    <td className="px-4 py-2.5 text-right text-ink-muted">{formatDateTime(row.lastCalledAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-ink-muted">{t("health.note")}</p>
      </UsagePanel>

      <UsagePanel title={t("workspaces.title")} aside={t("workspaces.aside")}>
        {loading ? (
          <ChartEmpty height={120}>{t("loading")}</ChartEmpty>
        ) : (data?.byWorkspace.length ?? 0) === 0 ? (
          <ChartEmpty height={120}>{t("workspaces.none")}</ChartEmpty>
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr className="border-b border-hairline/60 text-left text-[11px] text-ink-muted">
                  <th className="px-4 py-2 font-medium">{t("workspaces.columns.workspace")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("workspaces.columns.calls")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("workspaces.columns.failed")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("workspaces.columns.failedShare")}</th>
                </tr>
              </thead>
              <tbody>
                {data?.byWorkspace.map((row) => {
                  const href = workspaceHref(row.workspaceId);
                  const name = workspaceNames.get(row.workspaceId);
                  return (
                    <tr key={row.workspaceId} className="border-b border-hairline/60 last:border-b-0">
                      <td className="px-4 py-2.5">
                        {href && canReadWorkspaces ? (
                          <Link href={href} className="font-medium text-ink hover:text-primary hover:underline">
                            {name ?? row.workspaceId}
                          </Link>
                        ) : (
                          <span className="text-ink">{name ?? row.workspaceId}</span>
                        )}
                        {name ? <div className="font-mono text-[11px] text-ink-muted">{row.workspaceId}</div> : null}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatCount(row.calls)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">{formatCount(row.failed)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatRate(row.calls > 0 ? row.failed / row.calls : null)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </UsagePanel>

      <p className="text-[12px] text-ink-muted">{t("privacyNote")}</p>
    </div>
  );
}
