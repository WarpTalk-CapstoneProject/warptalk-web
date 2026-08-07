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
 */

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
}

/**
 * The browser's own IANA zone. Read rather than hardcoded to Asia/Ho_Chi_Minh: a host in another
 * zone booking "8am daily" means 8am where they are, and the server stores whichever zone it is
 * told. Falls back to the team's zone only if the platform cannot answer, which no supported
 * browser fails to do.
 */
export function detectTimeZone(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved) return resolved;
  } catch {
    // fall through
  }
  return "Asia/Ho_Chi_Minh";
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

/** How many meetings this draft will produce, inclusive of both ends. 0 when the draft is unusable. */
export function occurrenceCount(draft: DailyRecurrenceDraft, now: Date): number {
  if (!isValidTime(draft.time)) return 0;
  const end = parseLocalDate(draft.endDate);
  if (!end) return 0;

  const start = firstOccurrenceDate(draft.time, now);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  return days < 0 ? 0 : days + 1;
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

/** "Every day at 08:00 · 30 meetings · 7 Aug – 5 Sep" — what the host is about to create. */
export function describeDailySchedule(draft: DailyRecurrenceDraft, now: Date): string {
  const count = occurrenceCount(draft, now);
  if (count <= 0) return "";

  const start = firstOccurrenceDate(draft.time, now);
  const end = parseLocalDate(draft.endDate);
  const format = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);

  const range = end ? `${format(start)} – ${format(end)}` : format(start);
  return `Every day at ${draft.time} · ${count} meeting${count === 1 ? "" : "s"} · ${range}`;
}
