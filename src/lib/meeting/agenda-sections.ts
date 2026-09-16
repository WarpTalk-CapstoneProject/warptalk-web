import type { MeetingTimeState, MyMeetingItem } from "@/types/myMeetings";

import { endOfMonth, startOfDay, startOfMonth, weekOf } from "./meeting-day.ts";

/**
 * The calendar's Agenda view, as data: every day of one month, grouped into Monday-first weeks.
 *
 * Pure and free of React so it is `node --test`-able, like `meeting-day` next door. The component
 * that draws it (`components/schedules/agenda-list`) only has to walk what this returns; every
 * decision about which days exist, which week they sit in and what a week is called is made here,
 * where it can be pinned by a test instead of by a screenshot.
 */

/**
 * One meeting with its state resolved for this viewer, at this minute.
 *
 * Lives here rather than in the page because the Agenda, Month and Week views all take the same
 * rows, and a type declared locally in one page file is exactly how two views end up disagreeing
 * about what a row carries. `timeState` is resolved by the caller with `resolveMeetingTimeState` —
 * it is never stored (see the note on `MyMeetingItem`).
 */
export type TimedMeeting = MyMeetingItem & { timeState: MeetingTimeState };

/** One calendar day of the displayed month. */
export interface AgendaDay<T> {
  /** `String(startOfDay(date))` — the same key the page's month grid groups by. */
  key: string;
  /** Local midnight of the day. */
  date: Date;
  /** The day's meetings, earliest first. Empty days are kept: an empty day is content here. */
  meetings: T[];
  isToday: boolean;
}

/** One Monday-first week, holding only the days of it that fall inside the displayed month. */
export interface AgendaWeek<T> {
  /** The key of the week's Monday, which may belong to the previous month. */
  key: string;
  /** "7 – 13 Sep", or "31 Aug – 6 Sep" across a month boundary. Always the FULL Monday–Sunday. */
  label: string;
  isCurrentWeek: boolean;
  days: AgendaDay<T>[];
}

/**
 * English month and weekday abbreviations, spelled out rather than asked of `Intl`.
 *
 * Not a style preference: current ICU data formats September in `en-GB` as "Sept" (Node does),
 * older ICU builds say "Sep", and this view is server-rendered before it hydrates. A label that
 * depends on which ICU the server and the browser each ship is a hydration mismatch waiting to
 * happen — and the approved design says "Sep". The page's month grid hard-codes its weekday row
 * too.
 */
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** The day key of an ISO timestamp or a Date — local midnight, as a string. NaN in, "NaN" out. */
export function agendaDayKey(value: Date | string): string {
  return String(startOfDay(typeof value === "string" ? new Date(value) : value));
}

/** "Mon", "Tue", … — see `WEEKDAYS_SHORT` for why this is not `toLocaleDateString`. */
export function shortWeekday(date: Date): string {
  return WEEKDAYS_SHORT[date.getDay()];
}

/**
 * "7 – 13 Sep" within a month, "31 Aug – 6 Sep" across one.
 *
 * No year and no ISO week number, both on purpose. The month is already named by the navigator
 * above the list, and week numbers were in an earlier draft of the design and were rejected by the
 * user: nobody in this product plans by "week 37", and a number that means nothing to the reader is
 * noise in the one line that is supposed to orient them.
 */
export function formatAgendaWeekLabel(monday: Date, sunday: Date): string {
  const sameMonth =
    monday.getMonth() === sunday.getMonth() && monday.getFullYear() === sunday.getFullYear();
  const start = sameMonth
    ? `${monday.getDate()}`
    : `${monday.getDate()} ${MONTHS_SHORT[monday.getMonth()]}`;
  return `${start} – ${sunday.getDate()} ${MONTHS_SHORT[sunday.getMonth()]}`;
}

/**
 * Every day of `month`, empty ones included, grouped into Monday-first weeks.
 *
 * Meetings outside the month are dropped rather than trusted to be absent: the page fetches whole
 * months but a caller switching views may still hand over a wider window, and a meeting on the 1st
 * of the next month must not appear under this month's last week.
 *
 * `today` is null until the page has a clock (it renders on the server first); with no clock there
 * is no today and no current week, which is what the server markup has to say for hydration to
 * match.
 */
export function buildAgendaSections<T extends { occursAt: string }>(
  month: Date,
  meetings: readonly T[],
  today: Date | null,
): AgendaWeek<T>[] {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const todayKey = today ? agendaDayKey(today) : null;

  const byDay = new Map<string, T[]>();
  for (const meeting of meetings) {
    const key = agendaDayKey(meeting.occursAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(meeting);
    else byDay.set(key, [meeting]);
  }
  // Sorted per day here, so the caller may pass rows in any order. `sort` is stable, so two
  // meetings booked for the same minute keep the order the server sent them in.
  for (const bucket of byDay.values()) {
    bucket.sort((a, b) => Date.parse(a.occursAt) - Date.parse(b.occursAt));
  }

  const weeks: AgendaWeek<T>[] = [];
  // Walked by calendar week (`weekOf` builds each one by adding days to a local midnight, which is
  // what keeps a DST change from dropping or duplicating a day), starting from the week the 1st
  // falls in and stopping once a week starts after the month has ended.
  let anchor = new Date(first);
  while (anchor.getTime() <= last.getTime()) {
    const week = weekOf(anchor);
    const monday = week[0];
    const sunday = week[6];

    const days: AgendaDay<T>[] = [];
    for (const date of week) {
      if (date.getTime() < first.getTime() || date.getTime() > last.getTime()) continue;
      const key = agendaDayKey(date);
      days.push({ key, date, meetings: byDay.get(key) ?? [], isToday: key === todayKey });
    }

    weeks.push({
      key: agendaDayKey(monday),
      label: formatAgendaWeekLabel(monday, sunday),
      // Asked of the whole Monday–Sunday, not of the days shown: on the 31st of a month whose week
      // runs into the next one, that week is still "this week" even though only one of its days is
      // in the list.
      isCurrentWeek: todayKey !== null && week.some((date) => agendaDayKey(date) === todayKey),
      days,
    });

    anchor = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 1);
  }

  return weeks;
}

/**
 * Where the red "now" rule goes in one day's list: before the first meeting that has not started.
 *
 * The same rule as the week view's `NowLine`: the list has no hour axis, so the line cannot sit at
 * a clock position — it sits at the boundary between what has started and what has not. -1 means
 * everything has started and the line belongs after the last row. `meetings` must already be
 * sorted, which `buildAgendaSections` guarantees.
 */
export function nowInsertionIndex(
  meetings: readonly { occursAt: string }[],
  now: Date,
): number {
  const nowMs = now.getTime();
  return meetings.findIndex((meeting) => Date.parse(meeting.occursAt) > nowMs);
}
