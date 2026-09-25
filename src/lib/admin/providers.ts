/**
 * The admin Providers page: what it derives from the server's figures, kept out of the components so
 * it runs under node --test (relative imports only — no bundler there).
 *
 * The null rule holds everywhere: a figure the server could not measure is null, rendered as words
 * ("not tracked", "no price configured"), never as a 0 and never as a line dropping to the axis.
 */

import type {
  AdminProviderMetricSeriesDto,
  AdminProviderSummaryDto,
  ProviderDayStatus,
  ProviderKey,
  ProviderMetricKey,
  ProviderMetricUnit,
  ProviderStatus,
} from "../../types/admin-providers.ts";

// ── period ───────────────────────────────────────────────────────────────────

export const PROVIDER_PERIODS = ["today", "7d", "30d", "90d", "custom"] as const;
export type ProviderPeriod = (typeof PROVIDER_PERIODS)[number];

/** billing-service AdminProvidersService.MaxSeriesDays / MaxHourlyDays. */
export const MAX_PROVIDER_RANGE_DAYS = 120;
export const MAX_HOURLY_DAYS = 14;

const DAY_MS = 86_400_000;

export interface ResolvedProviderPeriod {
  period: ProviderPeriod;
  from: Date;
  to: Date;
  /** Whole local days the range covers. */
  days: number;
  /** Why a custom range was replaced by the default, or null. */
  notice: string | null;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function parseDay(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

export function isProviderPeriod(value: unknown): value is ProviderPeriod {
  return typeof value === "string" && (PROVIDER_PERIODS as readonly string[]).includes(value);
}

/**
 * Local days of the browser, as Insights does (it sends the browser's zone as `tz`, so the server's
 * day buckets and these edges agree). `to` is the start of the day after the last one, so today's
 * remaining hours are part of the range and come back as "still to come", not as 0.
 */
export function resolveProviderPeriod(
  params: { period?: string | null; from?: string | null; to?: string | null },
  now: Date,
): ResolvedProviderPeriod {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  let period: ProviderPeriod = isProviderPeriod(params.period) ? params.period : "30d";
  let notice: string | null = null;

  if (period === "custom") {
    const from = parseDay(params.from);
    const to = parseDay(params.to);
    const problem = !from || !to
      ? "Pick both a start and an end date"
      : from.getTime() > to.getTime()
        ? "The start date is after the end date"
        : from.getTime() > today.getTime()
          ? "That range has not happened yet"
          : Math.round((addDays(to, 1).getTime() - from.getTime()) / DAY_MS) > MAX_PROVIDER_RANGE_DAYS
            ? `A custom range can be at most ${MAX_PROVIDER_RANGE_DAYS} days`
            : null;
    if (!problem && from && to) {
      const end = to.getTime() >= today.getTime() ? tomorrow : addDays(to, 1);
      return { period, from, to: end, days: Math.round((end.getTime() - from.getTime()) / DAY_MS), notice: null };
    }
    notice = `${problem}; showing the last 30 days instead.`;
    period = "30d";
  }

  const days = period === "today" ? 1 : period === "7d" ? 7 : period === "90d" ? 90 : 30;
  return { period, from: addDays(today, 1 - days), to: tomorrow, days, notice };
}

export function providerRangeQuery(resolved: ResolvedProviderPeriod, tz: string) {
  return { from: resolved.from.toISOString(), to: resolved.to.toISOString(), tz };
}

/** Hourly buckets are offered only where the server allows them. */
export function hourlyAllowed(resolved: ResolvedProviderPeriod): boolean {
  return resolved.days <= MAX_HOURLY_DAYS;
}

// ── status ───────────────────────────────────────────────────────────────────

const STATUS_RANK: Record<ProviderStatus, number> = {
  major_outage: 0,
  partial_outage: 1,
  degraded: 2,
  unknown: 3,
  operational: 4,
};

/** Colour of a status, from theme tokens (both themes): the status.claude.com ladder. */
export function statusColor(status: ProviderStatus | ProviderDayStatus): string {
  switch (status) {
    case "operational":
      return "var(--success)";
    case "degraded":
      return "var(--warning)";
    case "partial_outage":
      return "var(--viz-3)";
    case "major_outage":
      return "var(--destructive)";
    default:
      return "var(--hairline-strong)";
  }
}

/** "99.43 %" style, with two decimals under 100 and none at 100; null is not a number. */
export function formatUptime(percent: number | null): string | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  if (percent >= 100) return "100%";
  return `${(Math.floor(percent * 100) / 100).toFixed(2)}%`;
}

// ── search and sort ──────────────────────────────────────────────────────────

export const PROVIDER_SORTS = ["status", "cost", "name", "uptime"] as const;
export type ProviderSort = (typeof PROVIDER_SORTS)[number];

export function filterAndSortProviders(
  providers: readonly AdminProviderSummaryDto[],
  query: string,
  sort: ProviderSort,
): AdminProviderSummaryDto[] {
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? providers.filter((provider) =>
        [provider.name, provider.key, provider.category, ...provider.services].some((text) => text.toLowerCase().includes(needle)),
      )
    : [...providers];

  // Nulls last on every numeric sort: an unmeasured provider is not the cheapest one.
  const byNumber = (pick: (p: AdminProviderSummaryDto) => number | null, descending: boolean) =>
    (a: AdminProviderSummaryDto, b: AdminProviderSummaryDto) => {
      const x = pick(a);
      const y = pick(b);
      if (x === null && y === null) return a.name.localeCompare(b.name);
      if (x === null) return 1;
      if (y === null) return -1;
      return descending ? y - x : x - y;
    };

  switch (sort) {
    case "cost":
      return filtered.sort(byNumber((p) => p.today.costUsd, true));
    case "uptime":
      return filtered.sort(byNumber((p) => p.uptime.percent, false));
    case "name":
      return filtered.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return filtered.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name));
  }
}

// ── metrics ──────────────────────────────────────────────────────────────────

/**
 * Colour follows the metric, never its position among the selected chips, so toggling one metric
 * off does not repaint the others. The lighter twins are mixes of a token, so both themes hold.
 */
export const METRIC_COLORS: Record<ProviderMetricKey, string> = {
  usage: "var(--viz-1)",
  billedCredits: "color-mix(in oklab, var(--viz-1) 50%, var(--muted-foreground))",
  costUsd: "var(--viz-2)",
  costVnd: "var(--viz-2)",
  calls: "var(--viz-5)",
  failures: "var(--viz-3)",
  errorRate: "var(--destructive)",
  p50Ms: "color-mix(in oklab, var(--viz-4) 50%, var(--muted-foreground))",
  p95Ms: "var(--viz-4)",
  roomMinutes: "var(--viz-5)",
  recordings: "var(--viz-3)",
  failedPayments: "var(--viz-3)",
  volumeVnd: "var(--viz-2)",
};

/** The chips each provider starts with (the rest are one click away). */
export function defaultMetrics(provider: ProviderKey): ProviderMetricKey[] {
  switch (provider) {
    case "livekit":
      return ["usage", "roomMinutes", "costUsd", "costVnd"];
    case "stripe":
      return ["usage", "costUsd", "costVnd", "failures", "p95Ms"];
    default:
      return ["usage", "costUsd", "costVnd", "failures", "p95Ms"];
  }
}

/** Cost in the page's currency only: USD and VND are one metric shown two ways. */
export function visibleMetricKeys(
  metrics: readonly AdminProviderMetricSeriesDto[],
  currency: "USD" | "VND",
): ProviderMetricKey[] {
  const hidden: ProviderMetricKey = currency === "USD" ? "costVnd" : "costUsd";
  return metrics.map((metric) => metric.key).filter((key) => key !== hidden);
}

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const integerFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatMetric(value: number | null | undefined, unit: ProviderMetricUnit): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  switch (unit) {
    case "usd":
      return `$${value >= 100 ? integerFormat.format(value) : value >= 1 ? value.toFixed(2) : value.toFixed(value === 0 ? 0 : 4)}`;
    case "vnd":
      return `${integerFormat.format(Math.round(value))} ₫`;
    case "percent":
      return `${value.toFixed(value >= 99.95 || value === 0 ? 0 : 2)}%`;
    case "ms":
      return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${integerFormat.format(value)} ms`;
    case "minutes":
      return `${numberFormat.format(value)} min`;
    default:
      return integerFormat.format(value);
  }
}

export interface ChartReadySeries {
  key: ProviderMetricKey;
  unit: ProviderMetricUnit;
  color: string;
  /** What is drawn: the raw values when every line shares a unit, else each as % of its own peak. */
  values: (number | null)[];
  /** What the tooltip and the table say. */
  raw: (number | null)[];
}

/**
 * Lines of different units cannot share an axis honestly (credits in the thousands, latency in ms,
 * cost in cents). With one unit the chart is plain; with several, each line is drawn as a share of
 * its own peak in the period (the axis says so) while the readout keeps every real value.
 */
export function chartSeries(
  metrics: readonly AdminProviderMetricSeriesDto[],
  selected: readonly ProviderMetricKey[],
): { mode: "shared" | "indexed"; unit: ProviderMetricUnit | null; series: ChartReadySeries[] } {
  const chosen = metrics.filter((metric) => selected.includes(metric.key));
  const units = new Set(chosen.map((metric) => metric.unit));
  const shared = units.size <= 1;
  const series = chosen.map((metric) => {
    const peak = Math.max(0, ...metric.values.map((v) => (v === null || !Number.isFinite(v) ? 0 : v)));
    return {
      key: metric.key,
      unit: metric.unit,
      color: METRIC_COLORS[metric.key],
      raw: metric.values,
      values: shared
        ? metric.values
        : metric.values.map((v) => (v === null ? null : peak > 0 ? (v / peak) * 100 : 0)),
    };
  });
  return { mode: shared ? "shared" : "indexed", unit: shared ? (chosen[0]?.unit ?? null) : null, series };
}

/** True when a metric has no value in any bucket: the chip is shown disabled with the server's reason. */
export function metricIsEmpty(metric: AdminProviderMetricSeriesDto): boolean {
  return metric.values.every((value) => value === null);
}

// ── uptime row ───────────────────────────────────────────────────────────────

/** The axis caption under the bars: "90 days ago" … "Today" (status.claude.com). */
export function uptimeAxis(days: number): { start: string; end: string } {
  return { start: `${days} days ago`, end: "Today" };
}

/** Pie slices from a breakdown: the server's items, with the chart colour slot of each. */
export function pieColors(count: number): string[] {
  const slots = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)"];
  return Array.from({ length: count }, (_, index) =>
    index < slots.length ? slots[index] : `color-mix(in oklab, ${slots[index % slots.length]} 55%, var(--muted-foreground))`,
  );
}
