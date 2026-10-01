import test from "node:test";
import assert from "node:assert/strict";

import { chartLayout, niceMax } from "../insights-report-charts.ts";
import { reportColumnWidths } from "../insights-report-docx.ts";
import { buildInsightsReport, inclusiveEnd, insightsReportFileName, type ReportPeriod } from "../insights-report.ts";
import type { BillingInsightsDto, InsightsMetric, MeetingsInsightsDto } from "../../../types/admin-insights.ts";

const metric = (id: string, value: number | null, previous: number | null, unit: InsightsMetric["unit"] = "count", note: string | null = null): InsightsMetric => ({
  id,
  value,
  previous,
  unit,
  higherIsBetter: true,
  note,
});

const range = { from: "2026-09-01T00:00:00Z", to: "2026-09-30T00:00:00Z" };

const period: ReportPeriod = {
  label: "Sep 2026",
  compare: "previousMonth",
  customFrom: "2026-09-01",
  customTo: "2026-09-30",
  previousFrom: new Date(2026, 7, 1),
  previousTo: new Date(2026, 7, 31),
};

const billing: BillingInsightsDto = {
  range,
  previousRange: range,
  generatedAt: range.to,
  metrics: [
    metric("revenue", 48_900_000, 39_150_000, "money"),
    metric("aiProviderCost", 10_000_000, null, "money", "Cartesia estimated"),
    metric("creditsConsumed", 1200, 1000, "credits"),
  ],
  revenueByDay: [
    { date: "2026-09-01", revenue: 100 },
    { date: "2026-09-02", revenue: null },
  ],
  revenueByDayNote: "1 day had no FX rate",
  revenueByMonth: [],
  revenueByMonthNote: null,
  creditsByService: [{ usageType: "TRANSLATION", credits: 900 }],
  topWorkspaces: [
    { workspaceId: "a", workspaceName: "Acme", credits: 800 },
    { workspaceId: "b", workspaceName: null, credits: 400 },
  ],
};

const meetings: MeetingsInsightsDto = {
  range,
  previousRange: range,
  metrics: [metric("meetingsHeld", 12, 12), metric("hoursTranslated", 30.5, 20, "hours")],
  meetingsByDay: [{ date: "2026-09-01", meetings: 3, hours: 1.5 }],
  liveNow: 0,
  startedToday: 0,
};

test("the report states both periods inclusively, with the comparison basis", () => {
  const report = buildInsightsReport({ billing, meetings }, period, new Date("2026-10-01T00:00:00Z"));
  assert.equal(report.range, "2026-09-01 to 2026-09-30");
  assert.equal(report.previousRange, "2026-08-01 to 2026-08-30");
  assert.match(report.comparisonLabel, /previous month/);
  assert.equal(inclusiveEnd(new Date(2026, 8, 1)), "2026-08-31");
});

test("the summary carries each headline figure with its change, and skips what has no value", () => {
  const { summary } = buildInsightsReport({ billing, meetings }, period);
  assert.ok(summary.some((s) => s.startsWith("Revenue: 48,900,000 VND, up 24.9%")));
  assert.ok(summary.some((s) => s.startsWith("AI provider cost:") && s.includes("no comparable figure")));
  assert.ok(summary.some((s) => s.startsWith("Meetings held: 12, unchanged")));
  assert.ok(!summary.some((s) => s.startsWith("Revenue minus AI cost")), "no figure, no sentence");
});

test("an unavailable source is named in the notes and its cells are dashes, never zero", () => {
  const report = buildInsightsReport({ billing }, period);
  assert.ok(report.notes.some((n) => n.startsWith("Meeting data was not available")));
  const usage = report.sections.find((s) => s.id === "usage")!;
  const meetingsRow = usage.tables[0].rows.find((r) => r[0] === "Meetings held")!;
  assert.deepEqual(meetingsRow, ["Meetings held", "—", "—", "—"]);
});

test("server notes on figures reach the report once", () => {
  const report = buildInsightsReport({ billing, meetings }, period);
  assert.equal(report.notes.filter((n) => n === "AI provider cost: Cartesia estimated").length, 1);
});

test("charts: revenue per day keeps a null day as a gap, ranked workspaces fall back to Unknown workspace", () => {
  const report = buildInsightsReport({ billing, meetings }, period);
  const charts = report.sections.flatMap((s) => s.charts);
  const revenue = charts.find((c) => c.id === "revenuePerDay")!;
  assert.deepEqual(revenue.points.map((p) => p.value), [100, null]);
  assert.equal(revenue.note, "1 day had no FX rate");
  const credits = charts.find((c) => c.id === "creditsPerWorkspace")!;
  assert.deepEqual(credits.points.map((p) => p.label), ["Acme", "Unknown workspace"]);
});

test("no margin percentage or plan table is invented without the P&L source", () => {
  const report = buildInsightsReport({ billing, meetings }, period);
  const titles = report.sections.flatMap((s) => s.tables.map((t) => t.title));
  assert.ok(!titles.includes("Revenue and AI cost by plan"));
  assert.ok(!titles.includes("AI provider cost"));
});

test("the daily table merges the sources by date", () => {
  const report = buildInsightsReport({ billing, meetings }, period);
  const daily = report.sections.find((s) => s.id === "daily")!.tables[0];
  assert.deepEqual(daily.rows[0], ["2026-09-01", "100 VND", "3", "1.5 h", "—"]);
  assert.deepEqual(daily.rows[1], ["2026-09-02", "—", "—", "—", "—"]);
});

test("file name follows the CSV's", () => {
  assert.equal(insightsReportFileName(period), "warptalk-insights-report-2026-09-01-to-2026-09-30.docx");
});

test("chart geometry: bars stay inside the plot and a null is zero-height", () => {
  assert.equal(niceMax(0), 1);
  assert.equal(niceMax(48_900_000), 50_000_000);
  const layout = chartLayout({ kind: "columns", points: [{ label: "a", value: 5 }, { label: "b", value: null }, { label: "c", value: 10 }] });
  assert.equal(layout.max, 10);
  const [a, b, c] = layout.bars;
  assert.equal(b.height, 0);
  assert.ok(Math.abs(c.height - layout.plot.height) < 1e-9);
  assert.ok(Math.abs(a.height * 2 - c.height) < 1e-9);
  for (const bar of layout.bars) assert.ok(bar.x >= layout.plot.x && bar.x + bar.width <= layout.plot.x + layout.plot.width);
});

test("table columns add up to the content width", () => {
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const widths = reportColumnWidths(n);
    assert.equal(widths.length, n);
    assert.equal(widths.reduce((a, b) => a + b, 0), 11906 - 1134 * 2);
  }
});
