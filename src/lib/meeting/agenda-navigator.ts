import { shiftWeeks, startOfDay, startOfMonth, weekOf } from "./meeting-day.ts";

/**
 * The rules behind the Agenda view's mini-calendar navigator, kept out of the component.
 *
 * The navigator is drawn twice — a month sidebar on desktop and a one-week strip on narrow
 * screens — and both have to agree about which days hold meetings, which week is "here", and
 * where a step lands. Those are three questions with an off-by-one waiting in each, so they are
 * answered once, here, as pure functions the tests can pin down without rendering anything.
 */

/**
 * Same locale as the calendar page's `APP_CALENDAR_LOCALE`. The page formats every date on it in
 * en-GB ("Tuesday 8 September"); a navigator that read its own labels in en-US would announce
 * "Tuesday, September 8" beside a list that says the opposite.
 */
export const AGENDA_CALENDAR_LOCALE = "en-GB";

/**
 * How many meetings fall on each day, keyed by `startOfDay`.
 *
 * Takes one Date PER MEETING — the page's `daysWithMeetings` is exactly that, duplicates and all —
 * so the count is the number of meetings rather than "at least one". The dot only needs presence,
 * but the day button's accessible name says "3 meetings", and a screen reader deserves the number
 * a sighted user would get by glancing at the list.
 */
export function countMeetingsByDay(days: readonly Date[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const day of days) {
    if (Number.isNaN(day.getTime())) continue;
    const key = startOfDay(day);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Whether `day` falls in the calendar month `month` points into (local wall clock). */
export function isInMonth(day: Date, month: Date): boolean {
  return day.getFullYear() === month.getFullYear() && day.getMonth() === month.getMonth();
}

/**
 * The first of the month `delta` months away. Negative goes back.
 *
 * Always lands on the 1st: stepping "31 January + 1 month" by `setMonth` overflows to 3 March,
 * and a navigator that skipped February on the way forward would be a very quiet bug.
 */
export function shiftMonths(month: Date, delta: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + delta, 1);
}

/**
 * Which week the narrow strip shows.
 *
 * The strip is a position indicator, so it follows the day at the top of the list. Until the list
 * reports one (first paint, or mid-way through a month switch while `visibleDay` still belongs to
 * the month being left) it falls back to today if today is in this month, else the 1st — the same
 * place the list itself opens on. A strip showing a week from the OTHER month would point at days
 * the list below it does not contain.
 */
export function stripAnchor(visibleDay: Date | null, month: Date, today: Date | null): Date {
  if (visibleDay && isInMonth(visibleDay, month)) return visibleDay;
  if (today && isInMonth(today, month)) return today;
  return startOfMonth(month);
}

/**
 * The day a prev/next-week step should scroll the list to.
 *
 * Normally the Monday of the target week. The exception is a week that straddles the month edge:
 * the Monday of 31 Aug – 6 Sep is in August, but the September list holds the 1st–6th of that week
 * and nothing before it. Landing on the first day of the week that is IN the month keeps the step
 * inside the list you are reading, instead of throwing you into August because the calendar's
 * Monday happens to fall there.
 *
 * Only a week with no day in the month returns a date outside it — the caller treats that as a
 * month change, which is what stepping past the edge genuinely is.
 */
export function weekStepTarget(from: Date, delta: number, month: Date): Date {
  const week = weekOf(shiftWeeks(from, delta));
  return week.find((day) => isInMonth(day, month)) ?? week[0];
}

// Module-level is fine here: constructing a formatter reads no other module and starts no work —
// it is the same pattern as `MeetingDayStrip`'s WEEKDAY / LONG_DATE.
const DAY_NAME = new Intl.DateTimeFormat(AGENDA_CALENDAR_LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/**
 * The accessible name of a day button: "Go to Tuesday 8 September, 3 meetings".
 *
 * "Go to" because the button moves the list rather than selecting anything — it has no pressed
 * state to announce. The count is always spoken, "no meetings" included: the dot's ABSENCE is
 * information to a sighted user, and a name that went silent on empty days would make a screen
 * reader user tab into each one to find out.
 */
export function dayButtonLabel(day: Date, count: number, options: { isToday?: boolean } = {}): string {
  const meetings = count === 0 ? "no meetings" : count === 1 ? "1 meeting" : `${count} meetings`;
  return `Go to ${options.isToday ? "today, " : ""}${DAY_NAME.format(day)}, ${meetings}`;
}
