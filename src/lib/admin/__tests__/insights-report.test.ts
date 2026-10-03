import test from "node:test";
import assert from "node:assert/strict";

import { reportColumnWidths } from "../insights-report-docx.ts";
import {
  buildInsightsReport,
  changeText,
  differenceText,
  inclusiveEnd,
  insightsReportFileName,
  meetingLengthNote,
  periodDayCount,
  periodTitle,
  timeZoneLabel,
  usdOnlyNote,
  type ReportPeriod,
} from "../insights-report.ts";
import { computeDelta } from "../insights-metrics.ts";
import type { BillingInsightsDto, BillingSnapshotDto, InsightsMetric, MeetingsInsightsDto, ProfitAndLossDto } from "../../../types/admin-insights.ts";

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
  assert.ok(summary.some((s) => s.startsWith("Revenue: 48,900,000.00 USD, up 24.9%")));
  assert.ok(summary.some((s) => s.startsWith("AI provider cost:") && s.includes("no comparable figure")));
  assert.ok(summary.some((s) => s.startsWith("Meetings held: 12, unchanged")));
  assert.ok(!summary.some((s) => s.startsWith("Revenue minus AI cost")), "no figure, no sentence");
});

test("an unavailable source is named in the notes and its cells are dashes, never zero", () => {
  const report = buildInsightsReport({ billing }, period);
  assert.ok(report.notes.some((n) => n.startsWith("Meeting data was not available")));
  const usage = report.sections.find((s) => s.id === "usage")!;
  const meetingsRow = usage.tables[0].rows.find((r) => r[0] === "Meetings held")!;
  assert.deepEqual(meetingsRow, ["Meetings held", "—", "—", "—", "—"]);
});

test("server notes on figures reach the report once", () => {
  const report = buildInsightsReport({ billing, meetings }, period);
  assert.equal(report.notes.filter((n) => n === "AI provider cost: Cartesia estimated").length, 1);
});

test("the title is one fixed name and the period is written out under it", () => {
  const report = buildInsightsReport({ billing }, period);
  assert.equal(report.title, "WarpTalk Insights Report");
  assert.equal(report.periodTitle, "1–30 September 2026");
  assert.equal(report.documentTitle, "WarpTalk Insights Report — 1–30 September 2026");
  assert.equal(report.periodDays, 30);
  assert.equal(periodTitle("2026-10-03", "2026-10-03"), "3 October 2026");
  assert.equal(periodTitle("2026-09-28", "2026-10-03"), "28 September – 3 October 2026");
  assert.equal(periodTitle("2026-12-15", "2027-01-14"), "15 December 2026 – 14 January 2027");
  assert.equal(periodDayCount("2026-10-03", "2026-10-03"), 1);
  assert.equal(periodDayCount("2026-02-01", "2026-03-01"), 29);
});

test("the report is tables and sentences: no section carries a chart, and a per-day note is kept", () => {
  const report = buildInsightsReport({ billing, meetings }, period);
  for (const section of report.sections) assert.deepEqual(Object.keys(section).sort(), ["id", "tables", "title"]);
  assert.ok(report.notes.includes("Revenue per day: 1 day had no FX rate"));
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
  assert.deepEqual(daily.rows[0], ["2026-09-01", "100.00 USD", "3", "1.5 h", "—"]);
  assert.deepEqual(daily.rows[1], ["2026-09-02", "—", "—", "—", "—"]);
});

test("file name follows the CSV's", () => {
  assert.equal(insightsReportFileName(period), "warptalk-insights-report-2026-09-01-to-2026-09-30.docx");
});

test("table columns add up to the content width", () => {
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const widths = reportColumnWidths(n);
    assert.equal(widths.length, n);
    assert.equal(widths.reduce((a, b) => a + b, 0), 11906 - 1134 * 2);
  }
  const text = reportColumnWidths(2, 0.28);
  assert.equal(text.reduce((a, b) => a + b, 0), 11906 - 1134 * 2);
  assert.ok(text[0] < text[1], "a table of text gives the second column the room");
});

// ── WT-892 follow-up: what a finance reader needs on paper ───────────────────

test("the table carries the absolute difference as well as the percentage", () => {
  const report = buildInsightsReport({ billing, meetings }, period);
  const usage = report.sections.find((s) => s.id === "usage")!.tables[0];
  assert.deepEqual(usage.columns, ["Metric", "This period", "Previous period", "Difference", "Change"]);
  const hours = usage.rows.find((r) => r[0] === "Hours translated")!;
  assert.deepEqual(hours, ["Hours translated", "30.5 h", "20 h", "+10.5 h", "▲ 52.5% · better"]);
  assert.equal(differenceText(10, 12.5, "money"), "-2.50 USD");
  assert.equal(differenceText(5, 5, "count"), "0");
  assert.equal(differenceText(null, 5, "count"), "—");
  assert.equal(differenceText(10.04, 10, "percent"), "0.0 pp");
});

test("a falling cost and a falling revenue are told apart: same arrow, opposite verdict", () => {
  const fall = computeDelta(80, 100);
  assert.equal(changeText(fall, false), "▼ 20.0% · better");
  assert.equal(changeText(fall, true), "▼ 20.0% · worse");
  assert.equal(changeText(fall), "▼ 20.0%", "without a direction of goodness the text makes no judgement");
  assert.equal(changeText(computeDelta(5, 5), true), "no change");
});

test("tones follow the verdict, so the document can colour them", () => {
  const withTones: BillingInsightsDto = {
    ...billing,
    metrics: [
      { ...metric("revenue", 80, 100, "money"), higherIsBetter: true },
      { ...metric("aiProviderCost", 80, 100, "money"), higherIsBetter: false },
    ],
  };
  const report = buildInsightsReport({ billing: withTones }, period);
  const table = report.sections[0].tables[0];
  const revenueRow = table.rows.findIndex((r) => r[0] === "Revenue");
  const costRow = table.rows.findIndex((r) => r[0] === "AI provider cost");
  assert.equal(table.tones![revenueRow][4], "bad");
  assert.equal(table.tones![costRow][4], "good");
  assert.match(report.summary.find((s) => s.startsWith("Revenue:"))!, /down 20\.0% from .* \(worse\)\.$/);
  assert.match(report.summary.find((s) => s.startsWith("AI provider cost:"))!, /\(better\)\.$/);
});

test("the report names the time zone of its days, with the offset", () => {
  assert.equal(timeZoneLabel("Asia/Ho_Chi_Minh", new Date("2026-10-03T00:00:00Z")), "Asia/Ho_Chi_Minh (UTC+07:00)");
  assert.equal(timeZoneLabel("UTC", new Date("2026-10-03T00:00:00Z")), "UTC (UTC+00:00)");
  assert.equal(timeZoneLabel("Not/AZone", new Date()), "Not/AZone");
  const report = buildInsightsReport({ billing }, period, new Date("2026-10-03T07:05:00Z"), { timeZone: "Asia/Ho_Chi_Minh" });
  assert.equal(report.timeZone, "Asia/Ho_Chi_Minh (UTC+07:00)");
  assert.equal(report.generatedAtLocal, "2026-10-03 14:05", "the stamp is in the period's zone, not UTC");
  assert.equal(buildInsightsReport({ billing }, period).timeZone, null, "no zone given, none claimed");
});

test("a period that is still running carries a warning; a closed one does not", () => {
  const running: ReportPeriod = {
    ...period,
    from: new Date(2026, 9, 1),
    to: new Date(2026, 9, 3, 14, 5),
    closed: false,
    axisEndDay: "2026-11-01",
  };
  const open = buildInsightsReport({ billing }, running, new Date(2026, 9, 3, 14, 5), { timeZone: "Asia/Ho_Chi_Minh" });
  assert.equal(open.warnings.length, 1);
  assert.match(open.warnings[0], /not closed yet: 3 of 31 days have passed/);
  assert.match(open.warnings[0], /planned to end on 2026-10-31/);
  assert.match(open.warnings[0], /the same days of the previous month/);

  const closed = buildInsightsReport({ billing }, { ...running, closed: true });
  assert.deepEqual(closed.warnings, []);
  assert.deepEqual(buildInsightsReport({ billing }, period).warnings, [], "a caller that cannot say gets no false alarm");
});

test("USD is the only currency the report names: no VND amount, rate or word anywhere", () => {
  const note =
    "includes 4,734,000 VND converted at 26,300 VND/USD (billing_pricing_config.fx_rate_usd_vnd); 2 Stripe subscription invoice(s) counted once with their checkout";
  assert.equal(
    usdOnlyNote(note),
    "includes payments taken in another currency, converted to USD at the exchange rate of the day each was paid; 2 Stripe subscription invoice(s) counted once with their checkout",
  );
  assert.equal(
    usdOnlyNote("excludes 1 VND rows (no fx_rate_usd_vnd configured)"),
    "excludes 1 payment(s) taken in another currency (no exchange rate was available)",
  );
  assert.equal(usdOnlyNote("excludes 2 EUR rows"), "excludes 2 payment(s) taken in another currency");
  assert.equal(
    usdOnlyNote("VND payments use the Stripe quote of their day; 3 days estimated"),
    "some figures include payments converted to USD from another currency; 3 days estimated",
    "a clause nobody anticipated is replaced whole, never passed through",
  );
  assert.equal(usdOnlyNote("Cartesia estimated"), "Cartesia estimated", "a note with no second currency is left alone");

  const withVnd: BillingInsightsDto = {
    ...billing,
    metrics: [metric("revenue", 100, 90, "money", note)],
    revenueByDayNote: note,
    revenueByMonthNote: "excludes 1 VND rows (no fx_rate_usd_vnd configured)",
  };
  const snapshot = {
    revenueToday: 1,
    revenueYesterday: 2,
    mrr: 3,
    mrrNote: note,
    revenueTodayNote: "1,000,000 VND today at 26,300 VND/USD",
    activeSubscriptions: 1,
    churnRateMonth: { rate: null, cancelled: 0, atMonthStart: 0 },
    trials: 0,
    pastDue: 0,
    outstandingInvoices: { count: 0, amount: 0, amountNote: note },
    subscriptionsByPlan: [],
  } as unknown as BillingSnapshotDto;
  const pnl = {
    plans: [{ planName: "Pro", revenue: 1, credits: 1, aiCost: 1, grossMargin: 0, marginPercent: 0, note }],
    providers: [],
    costNote: note,
    fxNote: "VND payments were converted at 26,300 VND/USD (Stripe FX quote)",
  } as unknown as ProfitAndLossDto;
  const report = buildInsightsReport({ billing: withVnd, snapshot, pnl }, period, new Date("2026-10-01T00:00:00Z"), { timeZone: "Asia/Ho_Chi_Minh" });
  const text = JSON.stringify(report);
  assert.doesNotMatch(text, /VND|₫|đồng/i, "the whole document, definitions included");
  assert.doesNotMatch(text, /billing_pricing_config|fx_rate_usd_vnd/, "no database key in a document for a reader");
  assert.match(text, /converted to USD/, "that a conversion happened is still said");
});

test("every money cell is USD", () => {
  const report = buildInsightsReport({ billing }, period);
  const cells = report.sections.filter((s) => s.id !== "definitions").flatMap((s) => s.tables.flatMap((t) => t.rows.flat()));
  assert.ok(cells.some((c) => / USD$/.test(c)));
  assert.ok(!cells.some((c) => /VND/.test(c)));
});

test("classification defaults to confidential and the admin's choice is carried", () => {
  assert.equal(buildInsightsReport({ billing }, period).classification.id, "confidential");
  const internal = buildInsightsReport({ billing }, period, new Date(), { classification: "internal" });
  assert.equal(internal.classification.label, "INTERNAL");
  assert.match(internal.classification.line, /^INTERNAL/);
});

test("the daily table can be left out, and the definitions always close the report", () => {
  const without = buildInsightsReport({ billing, meetings }, period, new Date(), { includeDaily: false });
  assert.ok(!without.sections.some((s) => s.id === "daily"));
  const withDaily = buildInsightsReport({ billing, meetings }, period);
  assert.ok(withDaily.sections.some((s) => s.id === "daily"));
  const last = withDaily.sections.at(-1)!;
  assert.equal(last.id, "definitions");
  const terms = last.tables[0].rows.map((r) => r[0]);
  for (const term of ["Revenue", "Hours translated", "Active subscriptions", "New and cancelled vs active", "Days and time zone"]) {
    assert.ok(terms.includes(term), term);
  }
});

test("a long average meeting is explained, a normal one is not", () => {
  const held = { ...metric("meetingsHeld", 100, 275), higherIsBetter: true };
  const hours = { ...metric("hoursTranslated", 14.2, 4005, "hours"), higherIsBetter: true };
  const note = meetingLengthNote(held, hours)!;
  assert.match(note, /Average meeting length is 0\.1 h this period and 14\.6 h in the previous period/);
  assert.match(note, /rooms left open raise them/);
  assert.match(note, /Hours moved down 99\.6% while meetings moved down 63\.6%/);
  assert.equal(meetingLengthNote({ ...held, value: 100, previous: 100 }, { ...hours, value: 80, previous: 90 }), null);
  assert.equal(meetingLengthNote(null, hours), null);
});

test("the file name can end in .pdf", () => {
  assert.equal(insightsReportFileName(period, "pdf"), "warptalk-insights-report-2026-09-01-to-2026-09-30.pdf");
});
