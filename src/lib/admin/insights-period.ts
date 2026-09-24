/**
 * The Insights page's period bar, as a pure function of the URL and the clock.
 *
 * The URL is the source of truth — `?period=today|7d|month|6m|custom&month=YYYY-MM&from=&to=` —
 * so a shared or refreshed link shows the same window. This turns those params into the
 * `[from, to)` range the insights endpoints take, the `compare` mode they should use, and the
 * words the page puts beside them.
 *
 * THE CAPTION HAS TO DESCRIBE THE COMPARISON THE SERVER ACTUALLY MAKES
 *   `previous` is "the same length immediately before", which for Today at 15:00 is yesterday
 *   09:00 to midnight — not "yesterday". Saying "vs yesterday" would compare 15 hours with 24 in
 *   the reader's head while the server compared 15 with 15. So every caption is derived from the
 *   same range maths the server does (contract: previous / previousMonth), not from the preset name.
 *
 * Everything is in the browser's local time: "today" is the admin's today. The range crosses the
 * wire as ISO-8601 UTC instants, TOGETHER WITH the browser's IANA time zone (`tz`), so the server
 * cuts its days, "today" and `previousMonth` on the same calendar these presets were built on. A
 * Vietnam month starts at 17:00Z the day before; without `tz` the server bucketed by UTC and every
 * daily figure was off by up to seven hours.
 *
 * DAYS ARE THE SERVER'S
 *   A per-day chart plots the server's own `date` keys (local days of `tz`) and labels them from the
 *   string. It never turns an instant back into a day in the browser: that would be a second
 *   bucketing, and the two only agree while the browser and `tz` do. The period only contributes
 *   `axisEndDay`, the blank days still to come.
 */

import type { InsightsCompare, InsightsQuery } from "../../types/admin-insights.ts";

export const INSIGHTS_PERIODS = ["today", "7d", "month", "6m", "custom"] as const;
export type InsightsPeriod = (typeof INSIGHTS_PERIODS)[number];

/** The server refuses anything longer (`AdminDateRange.TryNormalize`). */
export const MAX_RANGE_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCALE = "en-US";

export interface InsightsPeriodParams {
  period?: string | null;
  month?: string | null;
  from?: string | null;
  to?: string | null;
}

export interface ResolvedInsightsPeriod {
  period: InsightsPeriod;
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  compare: InsightsCompare;
  /** "Sep 2026", "Last 7 days", "Sep 1 – Sep 17, 2026". */
  label: string;
  /** "Sep 2026 · vs the same days last month". */
  caption: string;
  /** YYYY-MM the month button shows and the arrows step from. */
  month: string;
  prevMonth: string;
  /** Null at the current month: there is no future to look at. */
  nextMonth: string | null;
  /** YYYY-MM-DD, inclusive — the custom inputs' values. */
  customFrom: string;
  customTo: string;
  /**
   * Exclusive end of a per-day chart's axis, YYYY-MM-DD, when it runs past the server's last day:
   * for a month it is the first of the next month, for a custom range the day after its last day,
   * so the days still to come are on the axis and drawn blank. Null for the to-now presets.
   */
  axisEndDay: string | null;
  /** Set when the URL asked for something unusable and a default was shown instead. */
  notice: string | null;
}

// ── small date helpers (local time) ──────────────────────────────────────────

const pad = (value: number) => String(value).padStart(2, "0");

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/**
 * The same instant one calendar month earlier, day-of-month clamped — the server's `previousMonth`.
 * Mar 31 becomes Feb 28 (or 29), never Mar 3.
 */
export function shiftBackOneMonth(date: Date): Date {
  const year = date.getFullYear();
  const month = date.getMonth() - 1;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(
    year,
    month,
    Math.min(date.getDate(), lastDay),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

function parseMonth(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return new Date(Number(match[1]), month - 1, 1);
}

function parseDay(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // new Date(2026, 1, 31) silently becomes Mar 3; a date that does not round-trip is not a date.
  return dayKey(date) === match[0] ? date : null;
}

const monthLabel = (date: Date) =>
  new Intl.DateTimeFormat(LOCALE, { month: "short", year: "numeric" }).format(date);
const shortMonth = (date: Date) => new Intl.DateTimeFormat(LOCALE, { month: "short" }).format(date);
const dayLabel = (date: Date) =>
  new Intl.DateTimeFormat(LOCALE, { month: "short", day: "numeric" }).format(date);
const clock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

function isPeriod(value: string | null | undefined): value is InsightsPeriod {
  return (INSIGHTS_PERIODS as readonly string[]).includes(value ?? "");
}

// ── the resolver ─────────────────────────────────────────────────────────────

function previousOf(from: Date, to: Date, compare: InsightsCompare): { from: Date; to: Date } {
  if (compare === "previousMonth") {
    return { from: shiftBackOneMonth(from), to: shiftBackOneMonth(to) };
  }
  const length = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - length), to: new Date(from.getTime()) };
}

export function resolveInsightsPeriod(
  params: InsightsPeriodParams,
  now: Date,
): ResolvedInsightsPeriod {
  const today = startOfDay(now);
  const currentMonth = startOfMonth(now);

  let notice: string | null = null;
  let period: InsightsPeriod = isPeriod(params.period) ? params.period : "month";

  // The month the month button and its arrows work from. A future month is clamped to this one.
  let selectedMonth = parseMonth(params.month) ?? currentMonth;
  if (selectedMonth.getTime() > currentMonth.getTime()) selectedMonth = currentMonth;

  let from: Date;
  let to: Date;
  let compare: InsightsCompare = "previous";
  let label: string;
  let caption: string;
  let axisEndDay: string | null = null;

  // Custom is resolved first so an unusable range can fall back to the default month.
  let customFrom = parseDay(params.from);
  let customTo = parseDay(params.to);
  if (period === "custom") {
    const problem = !customFrom || !customTo
      ? "Pick both a start and an end date"
      : customFrom.getTime() > customTo.getTime()
        ? "The start date is after the end date"
        : customFrom.getTime() > today.getTime()
          ? "That range has not happened yet"
          : Math.round((addDays(customTo, 1).getTime() - customFrom.getTime()) / DAY_MS) > MAX_RANGE_DAYS
            ? `A custom range can be at most ${MAX_RANGE_DAYS} days`
            : null;
    if (problem) {
      notice = `${problem}; showing this month instead.`;
      period = "month";
      selectedMonth = currentMonth;
    }
  }

  switch (period) {
    case "today": {
      from = today;
      to = now;
      label = "Today";
      const previous = previousOf(from, to, compare);
      caption = `Today · vs yesterday ${clock(previous.from)}–24:00`;
      break;
    }
    case "7d": {
      from = addDays(today, -6);
      to = now;
      label = "Last 7 days";
      caption = "Last 7 days · vs the 7 days before";
      break;
    }
    case "6m": {
      from = addMonths(currentMonth, -5);
      to = now;
      label = from.getFullYear() === now.getFullYear()
        ? `${shortMonth(from)} – ${monthLabel(now)}`
        : `${monthLabel(from)} – ${monthLabel(now)}`;
      caption = `${label} · vs the 6 months before`;
      break;
    }
    case "custom": {
      // Validated above; both are set.
      const start = customFrom as Date;
      const endInclusive = customTo as Date;
      from = start;
      const endExclusive = addDays(endInclusive, 1);
      to = endExclusive.getTime() > now.getTime() ? now : endExclusive;
      const days = Math.round((endExclusive.getTime() - start.getTime()) / DAY_MS);
      label = start.getFullYear() === endInclusive.getFullYear()
        ? `${dayLabel(start)} – ${dayLabel(endInclusive)}, ${endInclusive.getFullYear()}`
        : `${dayLabel(start)}, ${start.getFullYear()} – ${dayLabel(endInclusive)}, ${endInclusive.getFullYear()}`;
      caption = `${label} · vs the ${days === 1 ? "day" : `${days} days`} before`;
      axisEndDay = dayKey(endExclusive);
      break;
    }
    case "month":
    default: {
      from = selectedMonth;
      const monthEnd = addMonths(selectedMonth, 1);
      const isCurrent = selectedMonth.getTime() === currentMonth.getTime();
      to = isCurrent ? now : monthEnd;
      compare = "previousMonth";
      label = monthLabel(selectedMonth);
      caption = isCurrent
        ? `${label} · vs the same days last month`
        : `${label} · vs the previous month`;
      axisEndDay = dayKey(monthEnd);
      break;
    }
  }

  const previous = previousOf(from, to, compare);
  if (period !== "custom") {
    customFrom = from;
    customTo = startOfDay(new Date(to.getTime() - 1));
  }

  const monthForArrows = period === "month" ? selectedMonth : currentMonth;
  const next = addMonths(monthForArrows, 1);

  return {
    period,
    from,
    to,
    previousFrom: previous.from,
    previousTo: previous.to,
    compare,
    label,
    caption,
    month: monthKey(monthForArrows),
    prevMonth: monthKey(addMonths(monthForArrows, -1)),
    nextMonth: next.getTime() > currentMonth.getTime() ? null : monthKey(next),
    customFrom: dayKey(customFrom as Date),
    customTo: dayKey(customTo as Date),
    axisEndDay,
    notice,
  };
}

/** The server's own default, used only when the browser will not name its zone. */
export const DEFAULT_INSIGHTS_TIME_ZONE = "Asia/Ho_Chi_Minh";

/** The browser's IANA time zone — the calendar every preset above was built on. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_INSIGHTS_TIME_ZONE;
  } catch {
    return DEFAULT_INSIGHTS_TIME_ZONE;
  }
}

/** What the insights endpoints are called with. `timeZone` must be the zone the period was built in. */
export function insightsQueryOf(resolved: ResolvedInsightsPeriod, timeZone: string): InsightsQuery {
  return {
    from: resolved.from.toISOString(),
    to: resolved.to.toISOString(),
    compare: resolved.compare,
    tz: timeZone,
  };
}

/** The query string for a period choice. Only the params that preset reads are written. */
export function insightsSearch(choice: {
  period: InsightsPeriod;
  month?: string;
  from?: string;
  to?: string;
}): string {
  const params = new URLSearchParams({ period: choice.period });
  if (choice.period === "month" && choice.month) params.set("month", choice.month);
  if (choice.period === "custom") {
    if (choice.from) params.set("from", choice.from);
    if (choice.to) params.set("to", choice.to);
  }
  return params.toString();
}

// ── the server's calendar keys ───────────────────────────────────────────────

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY = /^(\d{4})-(\d{2})$/;

/** YYYY-MM-DD plus `days`, as calendar arithmetic on the key itself — no time zone involved. */
export function addDaysToKey(key: string, days: number): string {
  const match = DAY_KEY.exec(key);
  if (!match) return key;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

/** "Sep 17" for a server day key, whatever zone the browser is in. */
export function dayKeyLabel(key: string): string {
  const match = DAY_KEY.exec(key);
  if (!match) return key;
  return new Intl.DateTimeFormat(LOCALE, { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))),
  );
}

/** "Sep" for a server month key. */
export function monthKeyLabel(key: string): string {
  const match = MONTH_KEY.exec(key);
  if (!match) return key;
  return new Intl.DateTimeFormat(LOCALE, { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)),
  );
}

export interface SeriesAxisDay<T> {
  /** The server's YYYY-MM-DD. */
  key: string;
  label: string;
  /** The server's row for the day; null for a day still to come. */
  row: T | null;
  future: boolean;
}

/**
 * A per-day chart's x-axis: the server's rows in the server's order, labelled from their own keys,
 * then — when `axisEndDay` runs past the last one — the days still to come, marked so the chart
 * leaves them blank instead of drawing a zero nobody has earned yet.
 */
export function seriesAxis<T extends { date: string }>(
  rows: readonly T[] | null | undefined,
  axisEndDay: string | null,
): SeriesAxisDay<T>[] {
  const days: SeriesAxisDay<T>[] = (rows ?? [])
    .filter((row) => DAY_KEY.test(row.date))
    .map((row) => ({ key: row.date, label: dayKeyLabel(row.date), row, future: false }));
  if (days.length === 0 || !axisEndDay || !DAY_KEY.test(axisEndDay)) return days;

  for (
    let key = addDaysToKey(days[days.length - 1].key, 1);
    key < axisEndDay && days.length <= MAX_RANGE_DAYS;
    key = addDaysToKey(key, 1)
  ) {
    days.push({ key, label: dayKeyLabel(key), row: null, future: true });
  }
  return days;
}
