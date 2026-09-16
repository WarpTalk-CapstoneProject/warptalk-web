/**
 * The Agenda navigator's rules: meeting counts per day, which week the narrow strip shows, where a
 * week step lands, and what a day button is called.
 *
 * The cases worth having are the month edges — a week that straddles two months is where a strip
 * either scrolls the list to a day that is not in it, or skips half a week — and the count, which
 * is the only thing a screen reader gets in place of the dot.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  countMeetingsByDay,
  dayButtonLabel,
  isInMonth,
  shiftMonths,
  stripAnchor,
  weekStepTarget,
} from "../agenda-navigator.ts";
import { startOfDay } from "../meeting-day.ts";

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const SEPTEMBER = new Date(2026, 8, 1);

test("meetings are counted per day, not merely marked", () => {
  const counts = countMeetingsByDay([
    new Date(2026, 8, 8, 9, 0),
    new Date(2026, 8, 8, 14, 30),
    new Date(2026, 8, 8, 23, 59),
    new Date(2026, 8, 9, 0, 0),
  ]);
  assert.equal(counts.get(startOfDay(new Date(2026, 8, 8))), 3);
  assert.equal(counts.get(startOfDay(new Date(2026, 8, 9))), 1);
  assert.equal(counts.get(startOfDay(new Date(2026, 8, 10))), undefined);
});

test("an unparseable date is skipped rather than counted under NaN", () => {
  const counts = countMeetingsByDay([new Date("not a date"), new Date(2026, 8, 8)]);
  assert.equal(counts.size, 1);
});

test("month membership is by local calendar month, across years", () => {
  assert.equal(isInMonth(new Date(2026, 8, 30, 23, 59), SEPTEMBER), true);
  assert.equal(isInMonth(new Date(2026, 9, 1), SEPTEMBER), false);
  assert.equal(isInMonth(new Date(2025, 8, 15), SEPTEMBER), false);
});

test("stepping months always lands on the 1st, even from the 31st", () => {
  // The setMonth overflow: 31 January + 1 month is 3 March, which would skip February entirely.
  assert.equal(iso(shiftMonths(new Date(2026, 0, 31), 1)), "2026-02-01");
  assert.equal(iso(shiftMonths(new Date(2026, 0, 15), -1)), "2025-12-01");
});

test("the strip follows the day at the top of the list", () => {
  const visible = new Date(2026, 8, 17);
  assert.equal(iso(stripAnchor(visible, SEPTEMBER, new Date(2026, 8, 11))), "2026-09-17");
});

test("with no visible day yet, the strip opens on today when today is in the month", () => {
  assert.equal(iso(stripAnchor(null, SEPTEMBER, new Date(2026, 8, 11))), "2026-09-11");
});

test("otherwise it opens on the 1st — never on a week from another month", () => {
  // Before hydration there is no clock at all.
  assert.equal(iso(stripAnchor(null, SEPTEMBER, null)), "2026-09-01");
  // Browsing a future month.
  assert.equal(iso(stripAnchor(null, SEPTEMBER, new Date(2026, 6, 20))), "2026-09-01");
  // Mid month-switch: the list still reports a day from the month being left.
  assert.equal(iso(stripAnchor(new Date(2026, 7, 28), SEPTEMBER, null)), "2026-09-01");
});

test("a week step normally lands on the Monday of the target week", () => {
  // Thu 17 Sep → the week of Mon 21 Sep, and back to Mon 7 Sep.
  assert.equal(iso(weekStepTarget(new Date(2026, 8, 17), 1, SEPTEMBER)), "2026-09-21");
  assert.equal(iso(weekStepTarget(new Date(2026, 8, 17), -1, SEPTEMBER)), "2026-09-07");
});

test("a step into a week straddling the month start lands on the 1st, not the Monday before it", () => {
  // 31 Aug – 6 Sep: its Monday is in August, but the September list starts on the 1st.
  assert.equal(iso(weekStepTarget(new Date(2026, 8, 9), -1, SEPTEMBER)), "2026-09-01");
});

test("a step into a week straddling the month end still lands on its Monday", () => {
  // 28 Sep – 4 Oct: the Monday is in September, so nothing needs clamping.
  assert.equal(iso(weekStepTarget(new Date(2026, 8, 23), 1, SEPTEMBER)), "2026-09-28");
});

test("a step past the month edge leaves the month — that is a month change", () => {
  assert.equal(iso(weekStepTarget(new Date(2026, 8, 28), 1, SEPTEMBER)), "2026-10-05");
  assert.equal(iso(weekStepTarget(new Date(2026, 8, 1), -1, SEPTEMBER)), "2026-08-24");
});

test("a day button is named for where it goes and how much is there", () => {
  assert.equal(dayButtonLabel(new Date(2026, 8, 8), 3), "Go to Tuesday 8 September, 3 meetings");
  assert.equal(dayButtonLabel(new Date(2026, 8, 8), 1), "Go to Tuesday 8 September, 1 meeting");
  assert.equal(dayButtonLabel(new Date(2026, 8, 8), 0), "Go to Tuesday 8 September, no meetings");
});

test("today is said out loud, since its shading is not", () => {
  assert.equal(
    dayButtonLabel(new Date(2026, 8, 11), 2, { isToday: true }),
    "Go to today, Friday 11 September, 2 meetings",
  );
});
