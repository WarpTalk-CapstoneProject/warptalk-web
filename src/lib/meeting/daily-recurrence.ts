/**
 * WT-327: the arithmetic behind the Daily modal.
 *
 * Pure and dependency-free so the two things that are actually easy to get wrong — "which day
 * does this start on?" and "how many meetings is the host about to create?" — are testable
 * without React, a browser, or a server.
 *
 * The server is the authority on all of it: it re-derives the start date, re-applies the default
 * end date, and enforces the maximum span. Everything here exists so the host can SEE what they
 * are about to create before they press the button, which is the difference between this control
 * and the dead switch it replaces.
 *
 * Named for DAILY because that was the only cadence when it was written. It now covers all three;
 * the file keeps its name so the change stayed a diff about behaviour rather than a rename across
 * every import of it.
 */

// Relative, with the extension, and a type-only import for the rest: these tests run under
// `node --experimental-strip-types`, which has no bundler and cannot resolve the "@/" alias at
// runtime. A value imported through the alias here would pass typecheck and fail every test.
import { describeRecurrenceSentence } from "./recurrence.ts";
import type { RecurrenceType } from "@/types/translationRoom";

/** Mirrors the backend's RecurrenceLimits.DefaultDurationDays. */
export const DEFAULT_DAILY_DURATION_DAYS = 30;

/** Mirrors the backend's RecurrenceLimits.MaxDurationDays. */
export const MAX_DAILY_DURATION_DAYS = 365;

/** The default the modal opens on when the host has not scheduled anything yet. */
export const DEFAULT_DAILY_TIME = "09:00";

export interface DailyRecurrenceDraft {
  /** "HH:mm", 24-hour, zero-padded — the exact shape the API expects. */
  time: string;
  /** "yyyy-MM-dd", inclusive. */
  endDate: string;
  /**
   * Which cadence this draft is. Optional and defaulting to DAILY so every existing caller and
   * every existing test keeps its meaning: this module was daily-only when it was written, and
   * the daily answers below must not change now that it is not.
   */
  type?: RecurrenceType;
  /** WEEKLY only: ISO weekdays, Monday 1 … Sunday 7. Empty falls back to the start date's weekday. */
  byWeekdays?: number[];
  /** MONTHLY only: 1–31. Absent falls back to the start date's own day. */
  byMonthDay?: number;
}

/**
 * The browser's own IANA zone. Read rather than hardcoded: a host in another zone booking
 * "8am daily" means 8am where they are, and the server stores whichever zone it is told.
 *
 * The fallback is UTC, not this team's own zone. Returning "Asia/Ho_Chi_Minh" when the
 * platform cannot answer is indistinguishable, downstream, from having detected it — so a
 * host in Berlin would have every occurrence booked seven hours off with nothing to indicate
 * a guess had been made. UTC is wrong for everyone equally, which is at least legible in the
 * stored series. No supported browser reaches this line.
 */
export function detectTimeZone(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved) return resolved;
  } catch {
    // fall through
  }
  return "UTC";
}

/** "yyyy-MM-dd" for a Date, read in local time — never toISOString(), which is UTC. */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "HH:mm" for a Date, in local time. */
export function toLocalTimeString(date: Date): string {
  return `${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}`;
}

export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  // Constructed in local time, deliberately: `new Date("2026-08-07")` parses as UTC midnight,
  // which is the previous day for everybody west of Greenwich.
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

/**
 * The first day the series will run, matching the server's own rule: today if that time has not
 * passed yet, otherwise tomorrow. Booking "daily at 08:00" at 09:00 must not promise a meeting
 * that already should have happened.
 */
export function firstOccurrenceDate(time: string, now: Date): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const todayAtTime = new Date(now);
  todayAtTime.setHours(hours, minutes, 0, 0);

  if (todayAtTime.getTime() > now.getTime()) return todayAtTime;

  const tomorrow = new Date(todayAtTime);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

export function defaultEndDate(time: string, now: Date): string {
  const start = firstOccurrenceDate(time, now);
  start.setDate(start.getDate() + DEFAULT_DAILY_DURATION_DAYS);
  return toLocalDateString(start);
}

/**
 * Every date this draft will produce, in order.
 *
 * Mirrors RecurrenceScheduleCalculator on the server, including the one rule that surprises
 * people: a MONTHLY draft SKIPS a month too short for its day, so "the 31st" has no February.
 * The server is still the authority — this exists so the host can see what they are about to
 * create, and a preview that quietly disagreed with the result would be worse than no preview.
 */
export function occurrenceDates(draft: DailyRecurrenceDraft, now: Date): Date[] {
  if (!isValidTime(draft.time)) return [];

  const end = parseLocalDate(draft.endDate);
  if (!end) return [];
  end.setHours(0, 0, 0, 0);

  const start = firstOccurrenceDate(draft.time, now);
  start.setHours(0, 0, 0, 0);
  if (end.getTime() < start.getTime()) return [];

  const dates: Date[] = [];
  const type = draft.type ?? "DAILY";
  // Well past any span the server accepts (365 days), so a malformed draft cannot spin here.
  const guard = MAX_DAILY_DURATION_DAYS + 2;

  if (type === "WEEKLY") {
    const weekdays = normalizeWeekdays(draft.byWeekdays) ?? [isoWeekday(start)];
    // Anchored on the Monday of the start's week, matching the server: the fortnight boundary
    // must not depend on which of the chosen days the series happens to begin on.
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() - (isoWeekday(start) - 1));

    for (let week = 0; week < guard && weekStart.getTime() <= end.getTime(); week += 1) {
      for (const weekday of weekdays) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + (weekday - 1));
        if (date.getTime() < start.getTime() || date.getTime() > end.getTime()) continue;
        dates.push(date);
      }
      weekStart.setDate(weekStart.getDate() + 7);
    }

    return dates;
  }

  if (type === "MONTHLY") {
    const dayOfMonth = draft.byMonthDay ?? start.getDate();
    const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);

    for (let month = 0; month < guard && monthStart.getTime() <= end.getTime(); month += 1) {
      const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
      if (dayOfMonth <= daysInMonth) {
        const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), dayOfMonth);
        if (date.getTime() >= start.getTime() && date.getTime() <= end.getTime()) dates.push(date);
      }
      monthStart.setMonth(monthStart.getMonth() + 1);
    }

    return dates;
  }

  for (const date = new Date(start); date.getTime() <= end.getTime(); date.setDate(date.getDate() + 1)) {
    dates.push(new Date(date));
    if (dates.length > guard) break;
  }

  return dates;
}

/** ISO weekday (Monday 1 … Sunday 7), which `getDay()` numbers differently. */
function isoWeekday(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1;
}

function normalizeWeekdays(weekdays?: number[]): number[] | null {
  if (!weekdays || weekdays.length === 0) return null;
  const valid = [...new Set(weekdays.filter((day) => day >= 1 && day <= 7))].sort((a, b) => a - b);
  return valid.length > 0 ? valid : null;
}

/** How many meetings this draft will produce, inclusive of both ends. 0 when the draft is unusable. */
export function occurrenceCount(draft: DailyRecurrenceDraft, now: Date): number {
  return occurrenceDates(draft, now).length;
}

export type DailyDraftProblem =
  | { kind: "time" }
  | { kind: "endDate" }
  | { kind: "endBeforeStart" }
  | { kind: "tooLong"; maxDays: number };

/**
 * Why this draft cannot be submitted, or null. Mirrors the server's refusals so the host is told
 * before the round trip — the server still checks, because a client check is a courtesy and not
 * a guarantee.
 */
export function validateDailyDraft(draft: DailyRecurrenceDraft, now: Date): DailyDraftProblem | null {
  if (!isValidTime(draft.time)) return { kind: "time" };

  const end = parseLocalDate(draft.endDate);
  if (!end) return { kind: "endDate" };

  const count = occurrenceCount(draft, now);
  if (count <= 0) return { kind: "endBeforeStart" };
  if (count > MAX_DAILY_DURATION_DAYS + 1) return { kind: "tooLong", maxDays: MAX_DAILY_DURATION_DAYS };

  return null;
}

export function describeDailyDraftProblem(problem: DailyDraftProblem): string {
  switch (problem.kind) {
    case "time":
      return "Pick a valid time of day.";
    case "endDate":
      return "Pick a valid last date.";
    case "endBeforeStart":
      return "The last date must be on or after the first meeting.";
    case "tooLong":
      return `A repeating meeting can run for at most ${problem.maxDays} days.`;
  }
}

/**
 * "Weekly on Mon, Wed at 08:00 · 8 meetings · Aug 10 – Sep 2" — what the host is about to create.
 *
 * The range is the FIRST and LAST dates the rule actually produces, not the draft's own end date.
 * A monthly booking ending on the 30th whose last meeting is the 15th must not claim a meeting on
 * the 30th, and that gap is exactly where a preview loses the host's trust.
 */
export function describeDailySchedule(draft: DailyRecurrenceDraft, now: Date): string {
  const dates = occurrenceDates(draft, now);
  if (dates.length === 0) return "";

  const format = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);

  const range =
    dates.length > 1 ? `${format(dates[0])} – ${format(dates[dates.length - 1])}` : format(dates[0]);

  return `${describeRecurrenceSentence({
    type: draft.type ?? "DAILY",
    byWeekdays: draft.byWeekdays,
    byMonthDay: draft.byMonthDay,
  })} at ${draft.time} · ${dates.length} meeting${dates.length === 1 ? "" : "s"} · ${range}`;
}
