import test from "node:test";
import assert from "node:assert/strict";

import {
  addDaysToKey,
  browserTimeZone,
  dayKeyLabel,
  insightsQueryOf,
  monthKeyLabel,
  seriesAxis,
  insightsSearch,
  resolveInsightsPeriod,
  shiftBackOneMonth,
} from "../insights-period.ts";

// Local time throughout, like the page: "today" is the admin's today.
const NOW = new Date(2026, 8, 17, 15, 30); // Thu 17 Sep 2026, 15:30
const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

test("no params means this month, compared with the same days last month", () => {
  const r = resolveInsightsPeriod({}, NOW);
  assert.equal(r.period, "month");
  assert.deepEqual(r.from, d(2026, 9, 1));
  assert.deepEqual(r.to, NOW, "the current month is clipped to now");
  assert.equal(r.compare, "previousMonth");
  assert.deepEqual(r.previousFrom, d(2026, 8, 1));
  assert.deepEqual(r.previousTo, d(2026, 8, 17, 15, 30));
  assert.equal(r.label, "Sep 2026");
  assert.equal(r.caption, "Sep 2026 · vs the same days last month");
  assert.equal(r.axisEndDay, "2026-10-01", "the axis runs to month end so future days show blank");
  assert.equal(r.notice, null);
});

test("a past month is the whole month, compared with the previous month", () => {
  const r = resolveInsightsPeriod({ period: "month", month: "2026-07" }, NOW);
  assert.deepEqual(r.from, d(2026, 7, 1));
  assert.deepEqual(r.to, d(2026, 8, 1));
  assert.equal(r.compare, "previousMonth");
  assert.deepEqual(r.previousFrom, d(2026, 6, 1));
  assert.deepEqual(r.previousTo, d(2026, 7, 1));
  assert.equal(r.caption, "Jul 2026 · vs the previous month");
});

test("month arrows: previous always, next disabled at the current month", () => {
  const current = resolveInsightsPeriod({ period: "month" }, NOW);
  assert.equal(current.prevMonth, "2026-08");
  assert.equal(current.nextMonth, null);

  const past = resolveInsightsPeriod({ period: "month", month: "2026-07" }, NOW);
  assert.equal(past.prevMonth, "2026-06");
  assert.equal(past.nextMonth, "2026-08");

  const august = resolveInsightsPeriod({ period: "month", month: "2026-08" }, NOW);
  assert.equal(august.nextMonth, "2026-09");

  const januaryBack = resolveInsightsPeriod({ period: "month", month: "2026-01" }, NOW);
  assert.equal(januaryBack.prevMonth, "2025-12");
});

test("a future or malformed month falls back to the current month", () => {
  assert.equal(resolveInsightsPeriod({ period: "month", month: "2027-01" }, NOW).month, "2026-09");
  assert.equal(resolveInsightsPeriod({ period: "month", month: "2026-13" }, NOW).month, "2026-09");
  assert.equal(resolveInsightsPeriod({ period: "month", month: "sep" }, NOW).month, "2026-09");
});

test("today runs from midnight to now and says exactly what it is compared with", () => {
  const r = resolveInsightsPeriod({ period: "today" }, NOW);
  assert.deepEqual(r.from, d(2026, 9, 17));
  assert.deepEqual(r.to, NOW);
  assert.equal(r.compare, "previous");
  // Same length immediately before: 15.5 hours ending at midnight — not all of yesterday.
  assert.deepEqual(r.previousFrom, d(2026, 9, 16, 8, 30));
  assert.deepEqual(r.previousTo, d(2026, 9, 17));
  assert.equal(r.caption, "Today · vs yesterday 08:30–24:00");
});

test("7 days is today and the six before it, compared with the same length before", () => {
  const r = resolveInsightsPeriod({ period: "7d" }, NOW);
  assert.deepEqual(r.from, d(2026, 9, 11));
  assert.deepEqual(r.to, NOW);
  assert.equal(r.compare, "previous");
  assert.equal(r.previousTo.getTime(), r.from.getTime());
  assert.equal(r.previousFrom.getTime(), r.from.getTime() - (r.to.getTime() - r.from.getTime()));
  assert.equal(r.label, "Last 7 days");
});

test("6 months is six calendar months including this one", () => {
  const r = resolveInsightsPeriod({ period: "6m" }, NOW);
  assert.deepEqual(r.from, d(2026, 4, 1));
  assert.deepEqual(r.to, NOW);
  assert.equal(r.compare, "previous");
  assert.equal(r.label, "Apr – Sep 2026");
  assert.equal(r.caption, "Apr – Sep 2026 · vs the 6 months before");

  const acrossYears = resolveInsightsPeriod({ period: "6m" }, d(2026, 2, 10, 9));
  assert.equal(acrossYears.label, "Sep 2025 – Feb 2026");
});

test("custom dates are inclusive, and compared with the same number of days before", () => {
  const r = resolveInsightsPeriod({ period: "custom", from: "2026-08-01", to: "2026-08-10" }, NOW);
  assert.equal(r.period, "custom");
  assert.deepEqual(r.from, d(2026, 8, 1));
  assert.deepEqual(r.to, d(2026, 8, 11), "the end date is included");
  assert.equal(r.compare, "previous");
  assert.deepEqual(r.previousFrom, d(2026, 7, 22));
  assert.deepEqual(r.previousTo, d(2026, 8, 1));
  assert.equal(r.label, "Aug 1 – Aug 10, 2026");
  assert.equal(r.caption, "Aug 1 – Aug 10, 2026 · vs the 10 days before");
  assert.equal(r.customFrom, "2026-08-01");
  assert.equal(r.customTo, "2026-08-10");
});

test("a custom range that ends today is clipped to now", () => {
  const r = resolveInsightsPeriod({ period: "custom", from: "2026-09-10", to: "2026-09-17" }, NOW);
  assert.deepEqual(r.to, NOW);
  assert.equal(r.axisEndDay, "2026-09-18");
});

test("an unusable custom range shows this month and says why", () => {
  for (const params of [
    { period: "custom", from: "2026-09-10" },
    { period: "custom", from: "2026-09-10", to: "2026-09-01" },
    { period: "custom", from: "2026-02-30", to: "2026-03-02" },
    { period: "custom", from: "2026-10-01", to: "2026-10-05" },
    { period: "custom", from: "2024-01-01", to: "2026-01-01" },
  ]) {
    const r = resolveInsightsPeriod(params, NOW);
    assert.equal(r.period, "month", JSON.stringify(params));
    assert.ok(r.notice, `a notice for ${JSON.stringify(params)}`);
    assert.equal(r.month, "2026-09");
  }
});

test("an unknown period is the default month", () => {
  assert.equal(resolveInsightsPeriod({ period: "year" }, NOW).period, "month");
});

test("previousMonth clamps the day of month rather than rolling over", () => {
  assert.deepEqual(shiftBackOneMonth(d(2026, 3, 31, 10)), d(2026, 2, 28, 10));
  assert.deepEqual(shiftBackOneMonth(d(2028, 3, 31)), d(2028, 2, 29));
  assert.deepEqual(shiftBackOneMonth(d(2026, 1, 15)), d(2025, 12, 15));
});

test("the query sends ISO instants, the compare mode and the time zone they were built in", () => {
  const r = resolveInsightsPeriod({ period: "month", month: "2026-07" }, NOW);
  const q = insightsQueryOf(r, "Asia/Ho_Chi_Minh");
  assert.equal(q.from, d(2026, 7, 1).toISOString());
  assert.equal(q.to, d(2026, 8, 1).toISOString());
  assert.equal(q.compare, "previousMonth");
  assert.equal(q.tz, "Asia/Ho_Chi_Minh");
});

test("the time zone sent is the browser's own", () => {
  assert.equal(browserTimeZone(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  assert.ok(insightsQueryOf(resolveInsightsPeriod({}, NOW), browserTimeZone()).tz.length > 0);
});

test(
  "a period's range instants are the admin's local midnights (Vietnam: 17:00Z the day before)",
  // Only meaningful in Vietnam; `TZ=Asia/Ho_Chi_Minh npm run test:admin-insights` runs it anywhere.
  { skip: browserTimeZone() !== "Asia/Ho_Chi_Minh" && "runs in Asia/Ho_Chi_Minh only" },
  () => {
    const q = insightsQueryOf(resolveInsightsPeriod({ period: "month", month: "2026-09" }, NOW), browserTimeZone());
    assert.equal(q.from, "2026-08-31T17:00:00.000Z");
  },
);

test("the URL only carries the params a preset reads", () => {
  assert.equal(insightsSearch({ period: "today", month: "2026-07", from: "x" }), "period=today");
  assert.equal(insightsSearch({ period: "month", month: "2026-07" }), "period=month&month=2026-07");
  assert.equal(
    insightsSearch({ period: "custom", from: "2026-08-01", to: "2026-08-10" }),
    "period=custom&from=2026-08-01&to=2026-08-10",
  );
});

// ── the server's day keys ────────────────────────────────────────────────────

const serverDays = (first: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({ date: addDaysToKey(first, index), revenue: index }));

test("the day axis is the server's days, then the month's days still to come", () => {
  const r = resolveInsightsPeriod({ period: "month" }, NOW);
  const days = seriesAxis(serverDays("2026-09-01", 17), r.axisEndDay);
  assert.equal(days.length, 30);
  assert.equal(days[0].key, "2026-09-01");
  assert.equal(days[16].key, "2026-09-17");
  assert.equal(days[16].future, false, "today is not the future");
  assert.equal(days[16].row?.revenue, 16);
  assert.equal(days[17].future, true);
  assert.equal(days[17].row, null);
  assert.equal(days.filter((day) => day.future).length, 13);
});

test("the axis never re-buckets: it keeps exactly the keys the server sent", () => {
  // A server in Asia/Ho_Chi_Minh sends 1 Sep first for [31 Aug 17:00Z, …); whatever the browser's
  // zone, that is the first bar and its label.
  const days = seriesAxis([{ date: "2026-09-01" }, { date: "2026-09-02" }], null);
  assert.deepEqual(days.map((day) => [day.key, day.label, day.future]), [
    ["2026-09-01", "Sep 1", false],
    ["2026-09-02", "Sep 2", false],
  ]);
});

test("a to-now preset adds no future days, and nothing is invented without server rows", () => {
  assert.equal(seriesAxis(serverDays("2026-09-11", 7), null).length, 7);
  assert.deepEqual(seriesAxis([], "2026-10-01"), []);
  assert.deepEqual(seriesAxis(undefined, "2026-10-01"), []);
});

test("day and month keys are labelled from the string, whatever the browser's zone", () => {
  assert.equal(dayKeyLabel("2026-09-01"), "Sep 1");
  assert.equal(dayKeyLabel("2026-12-31"), "Dec 31");
  assert.equal(monthKeyLabel("2026-04"), "Apr");
  assert.equal(addDaysToKey("2026-02-28", 1), "2026-03-01");
  assert.equal(addDaysToKey("2028-02-28", 1), "2028-02-29");
  assert.equal(addDaysToKey("2026-12-31", 1), "2027-01-01");
});
