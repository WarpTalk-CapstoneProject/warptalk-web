/**
 * The Agenda view's month → weeks → days structure, and where its "now" rule goes.
 *
 * Tested here rather than through the component because every mistake worth catching is a date
 * mistake: a month that starts on a Sunday (one-day first week), a week that straddles two months
 * (label spans both, "this week" still true), a meeting on the 1st of the next month leaking into
 * this one. All dates are built in LOCAL time, the same way the page builds them, so the assertions
 * hold in any time zone the suite runs in.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  type AgendaWeek,
  agendaDayKey,
  buildAgendaSections,
  formatAgendaWeekLabel,
  nowInsertionIndex,
  shortWeekday,
} from "../agenda-sections.ts";
import { meetingDisplayState, meetingStateLabel } from "../meeting-display-state.ts";

const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m, d, h, min).toISOString();

const meeting = (id: string, occursAt: string) => ({ id, occursAt });

const allDays = <T>(weeks: AgendaWeek<T>[]) => weeks.flatMap((week) => week.days);

test("September 2026 is five Monday-first weeks, labelled by date range only", () => {
  // 1 Sep 2026 is a Tuesday, 30 Sep a Wednesday.
  const weeks = buildAgendaSections(new Date(2026, 8, 15), [], null);
  assert.deepEqual(
    weeks.map((week) => week.label),
    ["31 Aug – 6 Sep", "7 – 13 Sep", "14 – 20 Sep", "21 – 27 Sep", "28 Sep – 4 Oct"],
  );
  // The straddling weeks are labelled by the whole Monday–Sunday but hold only this month's days.
  assert.deepEqual(weeks[0].days.map((day) => day.date.getDate()), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(weeks[4].days.map((day) => day.date.getDate()), [28, 29, 30]);
  assert.equal(weeks[0].key, agendaDayKey(new Date(2026, 7, 31)));
});

test("every day of the month is listed exactly once, in order, empty days included", () => {
  for (const [year, month, length] of [
    [2026, 1, 28], // February 2026 starts on a Sunday: a one-day first week.
    [2024, 1, 29], // Leap February.
    [2026, 2, 31], // March — the EU spring DST change, if the suite runs in such a zone.
    [2026, 9, 31], // October — the autumn one.
    [2026, 11, 31], // December — the last week runs into next year.
  ] as const) {
    const days = allDays(buildAgendaSections(new Date(year, month, 1), [], null));
    assert.equal(days.length, length, `${year}-${month + 1}`);
    days.forEach((day, index) => {
      assert.equal(day.date.getMonth(), month);
      assert.equal(day.date.getDate(), index + 1);
      assert.deepEqual(day.meetings, []);
    });
  }
});

test("a month starting on Sunday opens with a one-day week, and year boundaries read plainly", () => {
  const february = buildAgendaSections(new Date(2026, 1, 1), [], null);
  assert.equal(february[0].label, "26 Jan – 1 Feb");
  assert.equal(february[0].days.length, 1);

  const december = buildAgendaSections(new Date(2026, 11, 1), [], null);
  assert.equal(december.at(-1)?.label, "28 Dec – 3 Jan");
});

test("week labels use the fixed English abbreviations, never ICU's 'Sept'", () => {
  assert.equal(formatAgendaWeekLabel(new Date(2026, 8, 7), new Date(2026, 8, 13)), "7 – 13 Sep");
  assert.equal(shortWeekday(new Date(2026, 8, 7)), "Mon");
  assert.equal(shortWeekday(new Date(2026, 8, 13)), "Sun");
});

test("meetings are grouped by local day and sorted, in whatever order they arrive", () => {
  const rows = [
    meeting("late", at(2026, 8, 7, 16, 0)),
    meeting("early", at(2026, 8, 7, 9, 0)),
    meeting("tie-a", at(2026, 8, 7, 11, 0)),
    meeting("tie-b", at(2026, 8, 7, 11, 0)),
    meeting("other", at(2026, 8, 9, 10, 0)),
  ];
  const days = allDays(buildAgendaSections(new Date(2026, 8, 1), rows, null));
  const seventh = days.find((day) => day.date.getDate() === 7);
  const ninth = days.find((day) => day.date.getDate() === 9);

  // Stable for equal times: the server's order is kept.
  assert.deepEqual(seventh?.meetings.map((row) => row.id), ["early", "tie-a", "tie-b", "late"]);
  assert.deepEqual(ninth?.meetings.map((row) => row.id), ["other"]);
});

test("meetings outside the month, or with no parseable time, are dropped", () => {
  const rows = [
    meeting("previous", at(2026, 7, 31, 23, 30)),
    meeting("next", at(2026, 9, 1, 0, 0)),
    meeting("broken", "not a date"),
    meeting("kept", at(2026, 8, 30, 23, 59)),
  ];
  const days = allDays(buildAgendaSections(new Date(2026, 8, 1), rows, null));
  assert.deepEqual(
    days.flatMap((day) => day.meetings.map((row) => row.id)),
    ["kept"],
  );
});

test("today and the current week are marked only once there is a clock", () => {
  const withClock = buildAgendaSections(new Date(2026, 8, 1), [], new Date(2026, 8, 11, 14, 5));
  assert.deepEqual(
    allDays(withClock).filter((day) => day.isToday).map((day) => day.date.getDate()),
    [11],
  );
  assert.deepEqual(
    withClock.filter((week) => week.isCurrentWeek).map((week) => week.label),
    ["7 – 13 Sep"],
  );

  // Server render and hydration: no clock, so no today and no "This week".
  const noClock = buildAgendaSections(new Date(2026, 8, 1), [], null);
  assert.equal(allDays(noClock).some((day) => day.isToday), false);
  assert.equal(noClock.some((week) => week.isCurrentWeek), false);
});

test("a week that straddles the month is still 'this week' when today is on the other side", () => {
  // Monday 31 August, looking at September: today is not in the list, but its week is.
  const weeks = buildAgendaSections(new Date(2026, 8, 1), [], new Date(2026, 7, 31, 9, 0));
  assert.equal(allDays(weeks).some((day) => day.isToday), false);
  assert.equal(weeks[0].isCurrentWeek, true);
  assert.equal(weeks.filter((week) => week.isCurrentWeek).length, 1);
});

test("the now rule sits before the first meeting that has not started", () => {
  const day = [
    meeting("a", at(2026, 8, 11, 9, 0)),
    meeting("b", at(2026, 8, 11, 14, 5)),
    meeting("c", at(2026, 8, 11, 16, 0)),
  ];
  assert.equal(nowInsertionIndex(day, new Date(2026, 8, 11, 8, 0)), 0);
  assert.equal(nowInsertionIndex(day, new Date(2026, 8, 11, 10, 0)), 1);
  // A meeting starting this very minute has started: the line goes below it.
  assert.equal(nowInsertionIndex(day, new Date(2026, 8, 11, 14, 5)), 2);
  // Everything has started: -1, which the list draws after the last row.
  assert.equal(nowInsertionIndex(day, new Date(2026, 8, 11, 17, 0)), -1);
});

test("agendaDayKey is the same for a Date and an ISO string on the same local day", () => {
  assert.equal(agendaDayKey(new Date(2026, 8, 11, 0, 0)), agendaDayKey(at(2026, 8, 11, 23, 59)));
  assert.notEqual(agendaDayKey(at(2026, 8, 11, 23, 59)), agendaDayKey(at(2026, 8, 12, 0, 0)));
});

test("cancelled outranks every time state; otherwise the time state is shown as is", () => {
  for (const timeState of ["live", "upcoming", "joined", "missed"] as const) {
    assert.equal(meetingDisplayState({ status: "cancelled", timeState }), "cancelled");
    assert.equal(meetingStateLabel({ status: "cancelled", timeState }), "Cancelled");
    assert.equal(meetingDisplayState({ status: "scheduled", timeState }), timeState);
  }
  assert.equal(meetingStateLabel({ status: "in_progress", timeState: "live" }), "Live");
  assert.equal(meetingStateLabel({ status: "scheduled", timeState: "upcoming" }), "Upcoming");
  assert.equal(meetingStateLabel({ status: "ended", timeState: "joined" }), "Joined");
  assert.equal(meetingStateLabel({ status: "ended", timeState: "missed" }), "Missed");
});
