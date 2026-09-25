"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";

import { ChartEmpty, TimeSeriesChart } from "@/components/admin/charts/time-series-chart";
import { ProviderDetail } from "@/components/admin/providers/provider-detail";
import { ProviderUptimeRow } from "@/components/admin/providers/provider-uptime-row";
import { Tooltip } from "@/components/ui/tooltip";
import { useAdminProviderSeries } from "@/hooks/use-admin-providers";
import { dayKeyLabel } from "@/lib/admin/insights-period";
import { providerColors } from "@/lib/admin/insights-pnl";
import {
  METRIC_COLORS,
  chartSeries,
  defaultMetrics,
  formatMetric,
  metricIsEmpty,
  statusColor,
  visibleMetricKeys,
} from "@/lib/admin/providers";
import { cn } from "@/lib/utils";
import type { ProviderRangeQuery } from "@/services/admin-providers.service";
import type { AdminProviderSummaryDto, ProviderMetricKey, ProviderMetricUnit } from "@/types/admin-providers";

const COLORS = providerColors(["openai", "cartesia", "livekit", "stripe"]);

/**
 * One provider, one long card: identity and status, today's headline numbers, a multi-series line
 * chart with a chip per metric, and the 90-day uptime row. The header toggles the detail below it.
 */
export function ProviderCard({
  provider,
  range,
  granularity,
  currency,
  tz,
  expanded,
  onToggle,
}: {
  provider: AdminProviderSummaryDto;
  range: ProviderRangeQuery | null;
  granularity: "day" | "hour";
  currency: "USD" | "VND";
  tz: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("adminProviders");
  const series = useAdminProviderSeries(provider.key, range, granularity);
  const [selected, setSelected] = useState<ProviderMetricKey[]>(() => defaultMetrics(provider.key));

  const metrics = useMemo(() => series.data?.metrics ?? [], [series.data]);
  const offered = visibleMetricKeys(metrics, currency);
  const drawn = selected.filter((key) => offered.includes(key));
  const chart = chartSeries(metrics, drawn);
  // Nothing drawn has a single measured value: say why rather than draw an empty grid.
  const allBlank = chart.series.length > 0 && chart.series.every((s) => s.raw.every((v) => v === null));
  const blankMessage = metrics.find((m) => drawn.includes(m.key) && m.note)?.note ?? t("chart.empty");
  const usage = metrics.find((m) => m.key === "usage");
  const noUsage = usage !== undefined && usage.values.every((v) => v === null || v === 0) && !metricIsEmpty(usage);

  const toggle = (key: ProviderMetricKey) =>
    setSelected((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));

  const cost = currency === "USD" ? provider.today.costUsd : provider.today.costVnd;
  const detailId = `provider-detail-${provider.key}`;

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-surface-1">
      <div className="flex items-center gap-3 px-5 pt-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={detailId}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-md text-[15px] font-semibold text-white"
            style={{ background: COLORS[provider.key] }}
          >
            {provider.name.charAt(0)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-ink">{provider.name}</span>
            <span className="mt-0.5 block truncate text-[12px] text-ink-muted">{provider.services.join(" · ")}</span>
          </span>
        </button>
        <StatusChip
          status={provider.status}
          note={[t(`statusSource.${provider.statusSource}`), provider.statusNote].filter(Boolean).join(" · ")}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={detailId}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <span className="hidden sm:inline">{expanded ? t("detail.collapse") : t("detail.expand")}</span>
          <CaretDown size={16} aria-hidden className={cn("transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 pt-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label={t("stats.usageToday")}
          value={provider.today.usage === null ? null : `${formatMetric(provider.today.usage, "count")} ${t(`units.${provider.today.usageUnit}`)}`}
          empty={t("stats.notMeasured")}
          note={provider.today.usageNote}
        />
        <Stat
          label={t("stats.costToday")}
          value={cost === null ? null : formatMetric(cost, currency === "USD" ? "usd" : "vnd")}
          empty={t("stats.notMeasured")}
          note={provider.today.costNote}
        />
        <Stat
          label={t("stats.liveRate")}
          value={provider.live.successRate === null ? null : formatMetric(provider.live.successRate, "percent")}
          empty={t("stats.notTracked")}
          note={provider.live.calls === null ? provider.live.note : t("stats.calls", { count: provider.live.calls })}
        />
        <Stat
          label={t("stats.errorRate")}
          value={provider.live.errorRate === null ? null : formatMetric(provider.live.errorRate, "percent")}
          empty={t("stats.notTracked")}
          note={provider.live.failures === null ? null : `${formatMetric(provider.live.failures, "count")} ${t("uptime.failed")}`}
        />
        <Stat
          label={t("stats.latency")}
          value={
            provider.live.p50Ms === null && provider.live.p95Ms === null
              ? null
              : `${formatMetric(provider.live.p50Ms, "ms")} / ${formatMetric(provider.live.p95Ms, "ms")}`
          }
          empty={t("stats.notTracked")}
        />
      </dl>

      <div className="px-5 pt-4">
        <div role="group" aria-label={t("chart.metricsLabel")} className="mb-3 flex flex-wrap gap-1.5">
          {metrics
            .filter((metric) => offered.includes(metric.key))
            .map((metric) => {
              const empty = metricIsEmpty(metric);
              const on = drawn.includes(metric.key);
              const chip = (
                <button
                  key={metric.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(metric.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    on ? "border-transparent bg-surface-2 text-ink" : "border-border/60 text-ink-muted hover:text-ink",
                    empty && "opacity-60",
                  )}
                >
                  <i aria-hidden className="inline-block h-[2px] w-3 rounded-full" style={{ background: METRIC_COLORS[metric.key] }} />
                  {t(`metrics.${metric.key}`)}
                </button>
              );
              return metric.note ? (
                <Tooltip key={metric.key} content={metric.note}>
                  {chip}
                </Tooltip>
              ) : (
                chip
              );
            })}
        </div>

        {series.isError ? (
          <ChartEmpty height={200}>{t("chart.loadFailed")}</ChartEmpty>
        ) : !series.data ? (
          <div className="h-[200px] animate-pulse rounded-md bg-surface-2" aria-hidden />
        ) : chart.series.length === 0 ? (
          <ChartEmpty height={200}>{t("chart.pickMetric")}</ChartEmpty>
        ) : allBlank ? (
          <ChartEmpty height={200}>{blankMessage}</ChartEmpty>
        ) : (
          <>
            <TimeSeriesChart
              variant="line"
              height={200}
              labels={series.data.buckets.map((b) => (series.data!.granularity === "hour" ? b.key.slice(11) : dayKeyLabel(b.key)))}
              titles={series.data.buckets.map((b) => (series.data!.granularity === "hour" ? b.key.replace("T", " ") : dayKeyLabel(b.key)))}
              series={chart.series.map((s) => ({
                key: s.key,
                label: t(`metrics.${s.key}`),
                color: s.color,
                values: s.values,
                display: s.raw,
                formatValue: (value: number) => formatMetric(value, s.unit),
              }))}
              formatValue={(value) => (chart.mode === "indexed" ? `${Math.round(value)}%` : formatMetric(value, chart.unit ?? "count"))}
              formatAxis={chart.mode === "indexed" ? (value) => `${Math.round(value)}%` : (value) => axisOf(value, chart.unit)}
              describeGap={(index) => (series.data!.buckets[index]?.future ? t("chart.stillToCome") : t("chart.notTracked"))}
              ariaLabel={t("chart.aria", { provider: provider.name })}
            />
            {chart.mode === "indexed" ? <p className="mt-1 text-[11px] text-ink-subtle">{t("chart.indexed")}</p> : null}
            {noUsage ? <p className="mt-1 text-[11px] text-ink-subtle">{t("chart.empty")}</p> : null}
          </>
        )}
      </div>

      <div className="px-5 pb-5 pt-5">
        <ProviderUptimeRow provider={provider} tz={tz} />
      </div>

      {expanded ? (
        <div id={detailId}>
          <ProviderDetail provider={provider} series={series.data} range={range} currency={currency} tz={tz} />
        </div>
      ) : null}
    </article>
  );
}

function axisOf(value: number, unit: ProviderMetricUnit | null): string {
  if (unit === "usd") return value >= 1 ? `$${Math.round(value)}` : `$${value.toFixed(2)}`;
  if (unit === "vnd") return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1000 ? `${Math.round(value / 1000)}k` : `${value}`;
  if (unit === "ms") return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}`;
  if (unit === "percent") return `${Math.round(value)}%`;
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k` : `${Math.round(value * 10) / 10}`;
}

function StatusChip({ status, note }: { status: AdminProviderSummaryDto["status"]; note: string }) {
  const t = useTranslations("adminProviders");
  return (
    <Tooltip content={note}>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-ink">
        <i aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: statusColor(status) }} />
        {t(`status.${status}`)}
      </span>
    </Tooltip>
  );
}

function Stat({ label, value, empty, note }: { label: string; value: string | null; empty: string; note?: string | null }) {
  const body = (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-muted">{label}</dt>
      <dd className={cn("mt-0.5 truncate text-[17px] font-semibold tabular-nums", value === null ? "text-ink-muted" : "text-ink")}>
        {value ?? empty}
      </dd>
    </div>
  );
  return note ? <Tooltip content={note}>{body}</Tooltip> : body;
}
