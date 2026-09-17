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
 * wire as ISO-8601 UTC.
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
   * Exclusive end of a per-day chart's axis. For a month it is the first of the next month, so the
   * days still to come are on the axis and drawn blank; for every other preset it is `to`.
   */
  axisEnd: Date;
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
  let axisEnd: Date;

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
      axisEnd = to;
      break;
    }
    case "7d": {
      from = addDays(today, -6);
      to = now;
      label = "Last 7 days";
      caption = "Last 7 days · vs the 7 days before";
      axisEnd = to;
      break;
    }
    case "6m": {
      from = addMonths(currentMonth, -5);
      to = now;
      label = from.getFullYear() === now.getFullYear()
        ? `${shortMonth(from)} – ${monthLabel(now)}`
        : `${monthLabel(from)} – ${monthLabel(now)}`;
      caption = `${label} · vs the 6 months before`;
      axisEnd = to;
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
      axisEnd = endExclusive;
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
      axisEnd = monthEnd;
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
    axisEnd,
    notice,
  };
}

/** What the insights endpoints are called with. */
export function insightsQueryOf(resolved: ResolvedInsightsPeriod): InsightsQuery {
  return {
    from: resolved.from.toISOString(),
    to: resolved.to.toISOString(),
    compare: resolved.compare,
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

/**
 * Every local day on a per-day chart's axis, in order, as YYYY-MM-DD. Days after `now` are marked
 * so the chart leaves them blank instead of drawing a zero nobody has earned yet.
 */
export function axisDays(
  resolved: Pick<ResolvedInsightsPeriod, "from" | "axisEnd">,
  now: Date,
): { key: string; date: Date; future: boolean }[] {
  const days: { key: string; date: Date; future: boolean }[] = [];
  const today = startOfDay(now).getTime();
  for (
    let day = startOfDay(resolved.from);
    day.getTime() < resolved.axisEnd.getTime() && days.length <= MAX_RANGE_DAYS;
    day = addDays(day, 1)
  ) {
    days.push({ key: dayKey(day), date: day, future: day.getTime() > today });
  }
  return days;
}
