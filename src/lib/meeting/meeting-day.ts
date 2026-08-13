import type { TranslationRoomDto } from "@/types/translationRoom";

/**
 * Calendar-day arithmetic for meetings, in one place.
 *
 * `startOfDay` and `isScheduledOn` were written inline in the meetings list. The home page needs
 * exactly the same two answers, and this codebase has a long history of the same rule being
 * spelled out twice and then drifting — the meeting-language chip punctuated the same room two
 * different ways for months. So they move here before the second caller exists, not after.
 */

/** Midnight of the given date as a timestamp, for comparing days without comparing times. */
export function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a) === startOfDay(b);
}

/**
 * Whether this room was booked for the given calendar day.
 *
 * Status is deliberately not part of the question (WT-247): a meeting that has started, or has
 * already ended, still belongs on the day it was scheduled for. Rooms with no `scheduledAt` are
 * instant meetings and belong to no day at all.
 */
export function isScheduledOn(room: TranslationRoomDto, day: Date): boolean {
  if (!room.scheduledAt) return false;
  return isSameDay(new Date(room.scheduledAt), day);
}

/** Monday. The strip is a working week, and a week that starts on Sunday reads wrong here. */
const WEEK_STARTS_ON = 1;

/**
 * The seven days of the week `anchor` falls in, Monday first.
 *
 * Built by adding days to a local midnight rather than by adding 24h to a timestamp: the two
 * disagree on a DST boundary, and the one that breaks is the one that would silently drop or
 * duplicate a day twice a year.
 */
export function weekOf(anchor: Date): Date[] {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const offset = (start.getDay() - WEEK_STARTS_ON + 7) % 7;
  start.setDate(start.getDate() - offset);

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

/** The same weekday, `weeks` weeks away. Negative goes back. */
export function shiftWeeks(anchor: Date, weeks: number): Date {
  const shifted = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  shifted.setDate(shifted.getDate() + weeks * 7);
  return shifted;
}

/**
 * The set of day keys that hold at least one meeting.
 *
 * WT-251 is the reason this exists rather than the panel simply listing the selected day: the
 * meetings calendar gave no hint which days held anything, it opens on today, and a meeting
 * booked for any other day was effectively invisible. A day strip with no marks would repeat
 * that exactly.
 */
export function daysWithMeetings(rooms: readonly TranslationRoomDto[]): Set<number> {
  const days = new Set<number>();
  for (const room of rooms) {
    if (room.scheduledAt) days.add(startOfDay(new Date(room.scheduledAt)));
  }
  return days;
}

/** The rooms booked for `day`, earliest first. */
export function meetingsOn(
  rooms: readonly TranslationRoomDto[],
  day: Date,
): TranslationRoomDto[] {
  return rooms
    .filter((room) => isScheduledOn(room, day))
    .sort(
      (a, b) =>
        new Date(a.scheduledAt as string).getTime()
        - new Date(b.scheduledAt as string).getTime(),
    );
}

/**
 * Whether a meeting is over — ended, cancelled, or timed out.
 *
 * Lives here beside `isScheduledOn` because the two are always asked together. Picking a day on
 * the meetings list used to answer with the date alone, which dropped the tab's status rule and
 * listed cancelled occurrences under "Active Meetings" — a stopped daily series showed its future
 * dates as Cancelled, which reads as the UI reporting the wrong status for a healthy meeting.
 */
export function isMeetingOver(status: string): boolean {
  return status === "ended" || status === "cancelled" || status === "timeout";
}
