import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_PROVIDER_RANGE_DAYS,
  METRIC_COLORS,
  chartSeries,
  defaultMetrics,
  filterAndSortProviders,
  formatMetric,
  formatUptime,
  hourlyAllowed,
  metricIsEmpty,
  resolveProviderPeriod,
  statusColor,
  visibleMetricKeys,
} from "../providers.ts";
import type { AdminProviderMetricSeriesDto, AdminProviderSummaryDto } from "../../../types/admin-providers.ts";

const NOW = new Date(2026, 8, 25, 14, 30);

const provider = (key: AdminProviderSummaryDto["key"], name: string, overrides: Partial<AdminProviderSummaryDto> = {}): AdminProviderSummaryDto => ({
  key,
  name,
  category: "ai",
  services: ["Speech-to-text"],
  status: "operational",
  statusSource: "calls",
  statusNote: null,
  statusPage: null,
  today: { usageUnit: "credits", usage: 10, costUsd: 1, costVnd: 25_000, usageNote: null, costNote: null },
  live: { calls: 10, failures: 0, successRate: 100, errorRate: 0, p50Ms: 200, p95Ms: 800, callsLastHour: 1, note: null },
  uptime: { percent: 99.9, basis: "calls", trackedSince: null, days: 90 },
  config: [],
  ...overrides,
});

// ── period ──────────────────────────────────────────────────────────────────

test("presets end at the start of tomorrow, so today's rest is 'still to come', not 0", () => {
  const week = resolveProviderPeriod({ period: "7d" }, NOW);
  assert.equal(week.days, 7);
  assert.equal(week.from.getTime(), new Date(2026, 8, 19).getTime());
  assert.equal(week.to.getTime(), new Date(2026, 8, 26).getTime());

  const today = resolveProviderPeriod({ period: "today" }, NOW);
  assert.equal(today.days, 1);
  assert.equal(today.from.getTime(), new Date(2026, 8, 25).getTime());
});

test("an unknown period is the 30-day default", () => {
  assert.equal(resolveProviderPeriod({ period: "forever" }, NOW).period, "30d");
});

test("a custom range is inclusive and an unusable one falls back with a reason", () => {
  const ok = resolveProviderPeriod({ period: "custom", from: "2026-09-01", to: "2026-09-10" }, NOW);
  assert.equal(ok.period, "custom");
  assert.equal(ok.days, 10);
  assert.equal(ok.notice, null);

  const backwards = resolveProviderPeriod({ period: "custom", from: "2026-09-10", to: "2026-09-01" }, NOW);
  assert.equal(backwards.period, "30d");
  assert.match(backwards.notice ?? "", /start date is after the end date/);

  const tooLong = resolveProviderPeriod({ period: "custom", from: "2026-01-01", to: "2026-09-01" }, NOW);
  assert.match(tooLong.notice ?? "", new RegExp(`at most ${MAX_PROVIDER_RANGE_DAYS} days`));

  const future = resolveProviderPeriod({ period: "custom", from: "2026-10-01", to: "2026-10-02" }, NOW);
  assert.match(future.notice ?? "", /not happened yet/);
});

test("hourly buckets only for 14 days or less, as the server allows", () => {
  assert.equal(hourlyAllowed(resolveProviderPeriod({ period: "7d" }, NOW)), true);
  assert.equal(hourlyAllowed(resolveProviderPeriod({ period: "30d" }, NOW)), false);
});

// ── status ──────────────────────────────────────────────────────────────────

test("status colours are theme tokens, and no data is never green", () => {
  assert.equal(statusColor("operational"), "var(--success)");
  assert.equal(statusColor("major_outage"), "var(--destructive)");
  assert.notEqual(statusColor("no_data"), statusColor("operational"));
  for (const color of Object.values(METRIC_COLORS)) assert.match(color, /var\(--/);
});

test("uptime is truncated, not rounded up into a flattering 100%", () => {
  assert.equal(formatUptime(99.999), "99.99%");
  assert.equal(formatUptime(99.4378), "99.43%");
  assert.equal(formatUptime(100), "100%");
  assert.equal(formatUptime(null), null);
});

// ── search and sort ─────────────────────────────────────────────────────────

test("search matches name, key and services; status sort puts the worst first", () => {
  const list = [
    provider("openai", "OpenAI"),
    provider("cartesia", "Cartesia", { status: "major_outage", services: ["Dubbing (TTS)"] }),
    provider("stripe", "Stripe", { status: "degraded", category: "payments" }),
  ];
  assert.deepEqual(filterAndSortProviders(list, "dubbing", "status").map((p) => p.key), ["cartesia"]);
  assert.deepEqual(filterAndSortProviders(list, "", "status").map((p) => p.key), ["cartesia", "stripe", "openai"]);
});

test("numeric sorts keep unmeasured providers last instead of calling them cheapest", () => {
  const list = [
    provider("openai", "OpenAI", { today: { ...provider("openai", "x").today, costUsd: 2 } }),
    provider("stripe", "Stripe", { today: { ...provider("openai", "x").today, costUsd: null } }),
    provider("cartesia", "Cartesia", { today: { ...provider("openai", "x").today, costUsd: 5 } }),
  ];
  assert.deepEqual(filterAndSortProviders(list, "", "cost").map((p) => p.key), ["cartesia", "openai", "stripe"]);

  const uptime = [
    provider("openai", "OpenAI", { uptime: { percent: null, basis: "none", trackedSince: null, days: 90 } }),
    provider("cartesia", "Cartesia", { uptime: { percent: 97, basis: "calls", trackedSince: null, days: 90 } }),
  ];
  assert.deepEqual(filterAndSortProviders(uptime, "", "uptime").map((p) => p.key), ["cartesia", "openai"]);
});

// ── metrics ─────────────────────────────────────────────────────────────────

const metric = (key: AdminProviderMetricSeriesDto["key"], unit: AdminProviderMetricSeriesDto["unit"], values: (number | null)[]): AdminProviderMetricSeriesDto =>
  ({ key, unit, values, note: null });

test("one unit shares the axis; several units are indexed to their own peak but keep the real values", () => {
  const shared = chartSeries([metric("costUsd", "usd", [1, 2]), metric("usage", "credits", [5, 10])], ["costUsd"]);
  assert.equal(shared.mode, "shared");
  assert.deepEqual(shared.series[0].values, [1, 2]);

  const mixed = chartSeries(
    [metric("usage", "credits", [500, 1000, null]), metric("p95Ms", "ms", [200, 100, null])],
    ["usage", "p95Ms"],
  );
  assert.equal(mixed.mode, "indexed");
  assert.deepEqual(mixed.series[0].values, [50, 100, null]);
  assert.deepEqual(mixed.series[1].values, [100, 50, null]);
  assert.deepEqual(mixed.series[0].raw, [500, 1000, null], "the tooltip reads the real figures");
});

test("a line with no measurement at all stays null (a gap), never a flat 0", () => {
  const indexed = chartSeries([metric("usage", "credits", [null, null]), metric("calls", "count", [1, 2])], ["usage", "calls"]);
  assert.deepEqual(indexed.series[0].values, [null, null]);
  assert.equal(metricIsEmpty(metric("usage", "credits", [null, null])), true);
});

test("cost is shown in the page's currency only, and defaults include it", () => {
  const metrics = [metric("usage", "credits", []), metric("costUsd", "usd", []), metric("costVnd", "vnd", [])];
  assert.deepEqual(visibleMetricKeys(metrics, "USD"), ["usage", "costUsd"]);
  assert.deepEqual(visibleMetricKeys(metrics, "VND"), ["usage", "costVnd"]);
  assert.ok(defaultMetrics("openai").includes("p95Ms"));
  assert.ok(!defaultMetrics("stripe").includes("calls"));
});

test("figures are formatted by unit and a null is a dash", () => {
  assert.equal(formatMetric(null, "usd"), "—");
  assert.equal(formatMetric(0.0123, "usd"), "$0.0123");
  assert.equal(formatMetric(12.5, "usd"), "$12.50");
  assert.equal(formatMetric(1_250_000, "vnd"), "1,250,000 ₫");
  assert.equal(formatMetric(1540, "ms"), "1.54 s");
  assert.equal(formatMetric(99.5, "percent"), "99.50%");
  assert.equal(formatMetric(100, "percent"), "100%");
});
