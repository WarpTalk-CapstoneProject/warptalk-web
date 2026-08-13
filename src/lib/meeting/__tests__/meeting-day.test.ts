/**
 * The calendar-day arithmetic behind the home day strip and the meetings timeline.
 *
 * Pure functions, so they are tested directly rather than through a component. The two cases
 * worth having are the ones that are wrong in most hand-written versions of this: a week that
 * crosses a month boundary, and a week that crosses a DST change.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  daysWithMeetings,
  isMeetingOver,
  isSameDay,
  isScheduledOn,
  meetingsOn,
  shiftWeeks,
  startOfDay,
  weekOf,
  endOfMonth,
  monthKey,
  monthsSpanning,
  startOfMonth,
} from "../meeting-day.ts";

/** Only the fields these helpers read. */
function room(scheduledAt: string | undefined, id = scheduledAt ?? "instant") {
  return { id, scheduledAt } as unknown as Parameters<typeof isScheduledOn>[0];
}

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

test("a week runs Monday to Sunday and contains its anchor", () => {
  // 2026-08-10 is a Monday.
  const days = weekOf(new Date(2026, 7, 12));
  assert.equal(days.length, 7);
  assert.deepEqual(days.map(iso), [
    "2026-08-10",
    "2026-08-11",
    "2026-08-12",
    "2026-08-13",
    "2026-08-14",
    "2026-08-15",
    "2026-08-16",
  ]);
});

test("a Sunday belongs to the week that started the Monday before it", () => {
  // The off-by-one every hand-rolled week strip has: JS getDay() makes Sunday 0, so a naive
  // `date - getDay()` puts Sunday at the START of the following week.
  assert.equal(iso(weekOf(new Date(2026, 7, 16))[0]), "2026-08-10");
  assert.equal(iso(weekOf(new Date(2026, 7, 16))[6]), "2026-08-16");
});

test("a week spanning a month boundary still has seven consecutive days", () => {
  const days = weekOf(new Date(2026, 7, 31)); // Mon 31 Aug
  assert.deepEqual(days.map(iso), [
    "2026-08-31",
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
    "2026-09-06",
  ]);
});

test("a week is built from calendar days, not from 24-hour steps", () => {
  // The reason weekOf adds to a local midnight instead of adding 86_400_000 ms: on a DST
  // boundary a 24h step lands at 23:00 or 01:00 of the same or next day, and the strip silently
  // repeats or skips one. Asserting seven DISTINCT day keys catches that without needing to know
  // which zone the test runs in.
  for (const anchor of [new Date(2026, 2, 29), new Date(2026, 9, 25), new Date(2026, 10, 1)]) {
    const keys = new Set(weekOf(anchor).map(startOfDay));
    assert.equal(keys.size, 7, `week of ${iso(anchor)} must hold seven distinct days`);
  }
});

test("shifting by weeks lands on the same weekday", () => {
  const monday = new Date(2026, 7, 10);
  assert.equal(iso(shiftWeeks(monday, 1)), "2026-08-17");
  assert.equal(iso(shiftWeeks(monday, -1)), "2026-08-03");
  assert.equal(shiftWeeks(monday, 3).getDay(), monday.getDay());
});

test("a room belongs to the day it was scheduled for, whatever its status", () => {
  const day = new Date(2026, 7, 10, 0, 0, 0);
  assert.equal(isScheduledOn(room(new Date(2026, 7, 10, 23, 30).toISOString()), day), true);
  assert.equal(isScheduledOn(room(new Date(2026, 7, 11, 0, 15).toISOString()), day), false);
});

test("an instant meeting belongs to no day at all", () => {
  // No scheduledAt. It must not fall onto today by accident, or every ad-hoc room would pile
  // onto whichever day the strip happens to open on.
  assert.equal(isScheduledOn(room(undefined), new Date(2026, 7, 10)), false);
  assert.equal(daysWithMeetings([room(undefined)]).size, 0);
});

test("the marked days are exactly the days that hold something", () => {
  const marks = daysWithMeetings([
    room(new Date(2026, 7, 10, 9, 0).toISOString(), "a"),
    room(new Date(2026, 7, 10, 17, 0).toISOString(), "b"),
    room(new Date(2026, 7, 14, 9, 0).toISOString(), "c"),
    room(undefined, "d"),
  ]);

  assert.equal(marks.size, 2);
  assert.equal(marks.has(startOfDay(new Date(2026, 7, 10))), true);
  assert.equal(marks.has(startOfDay(new Date(2026, 7, 14))), true);
  assert.equal(marks.has(startOfDay(new Date(2026, 7, 11))), false);
});

test("a day's meetings come back earliest first", () => {
  const late = room(new Date(2026, 7, 10, 16, 0).toISOString(), "late");
  const early = room(new Date(2026, 7, 10, 8, 0).toISOString(), "early");
  const otherDay = room(new Date(2026, 7, 11, 8, 0).toISOString(), "other");

  const listed = meetingsOn([late, early, otherDay], new Date(2026, 7, 10));

  assert.deepEqual(listed.map((r) => r.id), ["early", "late"]);
});

test("isSameDay ignores the time of day", () => {
  assert.equal(isSameDay(new Date(2026, 7, 10, 0, 0), new Date(2026, 7, 10, 23, 59)), true);
  assert.equal(isSameDay(new Date(2026, 7, 10, 23, 59), new Date(2026, 7, 11, 0, 0)), false);
});

// The report: a daily series booked for the 15th and 16th showed those days as "Cancelled",
// under a heading reading "Active Meetings 2". The status was real — the series had been stopped,
// so its future occurrences were cancelled with it — but the tab had no business showing them.
// Picking a day returned before the tab's status rule ran, so the date replaced the tab instead
// of narrowing it.
test("a day picked on Active excludes meetings that are over", () => {
  assert.equal(isMeetingOver("cancelled"), true);
  assert.equal(isMeetingOver("ended"), true);
  assert.equal(isMeetingOver("timeout"), true);
});

test("a day picked on Active keeps everything still to come", () => {
  for (const live of ["scheduled", "waiting", "in_progress", "paused"]) {
    assert.equal(isMeetingOver(live), false, `${live} is not over`);
  }
});

// The week view fetches by month, because that is what the cache is keyed by. The one thing that
// has to hold for that to be safe is this: a week that straddles two months must ask for both.
// Getting it wrong is invisible in testing — the view still renders, it just quietly drops half a
// week — which is why it is pinned here rather than trusted.

test("a range inside one month asks for that month only", () => {
  assert.deepEqual(
    monthsSpanning(new Date(2026, 7, 10), new Date(2026, 7, 16)).map(monthKey),
    ["2026-08"],
  );
});

test("a week crossing a month boundary asks for BOTH months", () => {
  // Mon 31 Aug 2026 → Sun 6 Sep 2026, the exact case the month-scoped fetch would have halved.
  const week = weekOf(new Date(2026, 7, 31));
  assert.deepEqual(
    monthsSpanning(week[0], week[6]).map(monthKey),
    ["2026-08", "2026-09"],
  );
});

test("a week crossing a year boundary asks for both months, in order", () => {
  const week = weekOf(new Date(2026, 11, 31));
  assert.deepEqual(
    monthsSpanning(week[0], week[6]).map(monthKey),
    ["2026-12", "2027-01"],
  );
});

test("a whole month asks for exactly that month, not the next one too", () => {
  const anchor = new Date(2026, 1, 14);
  assert.deepEqual(
    monthsSpanning(startOfMonth(anchor), endOfMonth(anchor)).map(monthKey),
    ["2026-02"],
  );
});

test("the months come back oldest first, with no gaps", () => {
  assert.deepEqual(
    monthsSpanning(new Date(2026, 10, 25), new Date(2027, 1, 2)).map(monthKey),
    ["2026-11", "2026-12", "2027-01", "2027-02"],
  );
});

test("an inverted range yields one month rather than looping forever", () => {
  assert.deepEqual(
    monthsSpanning(new Date(2026, 7, 20), new Date(2026, 6, 1)).map(monthKey),
    ["2026-08"],
  );
});

// Month bounds are built by day-1 arithmetic, not by adding 30 days: February and a 31-day month
// are where the naive version drifts.
test("endOfMonth lands on the real last day, February included", () => {
  assert.equal(iso(endOfMonth(new Date(2026, 1, 5))), "2026-02-28");
  assert.equal(iso(endOfMonth(new Date(2028, 1, 5))), "2028-02-29");
  assert.equal(iso(endOfMonth(new Date(2026, 0, 5))), "2026-01-31");
  assert.equal(iso(startOfMonth(new Date(2026, 0, 31))), "2026-01-01");
});

test("endOfMonth includes the last day's meetings, not midnight that morning", () => {
  const end = endOfMonth(new Date(2026, 7, 5));
  assert.equal(end.getHours(), 23);
  assert.equal(end.getMinutes(), 59);
});
