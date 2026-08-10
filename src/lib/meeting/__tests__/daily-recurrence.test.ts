import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_DAILY_DURATION_DAYS,
  MAX_DAILY_DURATION_DAYS,
  defaultEndDate,
  describeDailySchedule,
  firstOccurrenceDate,
  isValidTime,
  occurrenceCount,
  parseLocalDate,
  toLocalDateString,
  validateDailyDraft,
} from "../daily-recurrence.ts";

// Local time throughout: the Daily modal is entirely a local-wall-clock control, and the whole
// class of bug it can have is a UTC/local mix-up. `new Date(y, m, d, h)` is local by definition.
const tenAmOn6Aug = new Date(2026, 7, 6, 10, 0, 0);

test("an 08:00 daily booked at 10:00 starts tomorrow", () => {
  // The single most reachable mistake: promising a meeting for 08:00 this morning.
  const first = firstOccurrenceDate("08:00", tenAmOn6Aug);
  assert.equal(toLocalDateString(first), "2026-08-07");
  assert.equal(first.getHours(), 8);
});

test("a 23:00 daily booked at 10:00 starts today", () => {
  assert.equal(toLocalDateString(firstOccurrenceDate("23:00", tenAmOn6Aug)), "2026-08-06");
});

test("a time that has only just passed still rolls to tomorrow", () => {
  const oneMinutePast = new Date(2026, 7, 6, 8, 1, 0);
  assert.equal(toLocalDateString(firstOccurrenceDate("08:00", oneMinutePast)), "2026-08-07");
});

test("the default end date is a bounded span, not forever", () => {
  // Something must stop a series generating rooms for an abandoned workspace.
  assert.equal(defaultEndDate("08:00", tenAmOn6Aug), "2026-09-06");
  assert.equal(
    occurrenceCount({ time: "08:00", endDate: defaultEndDate("08:00", tenAmOn6Aug) }, tenAmOn6Aug),
    DEFAULT_DAILY_DURATION_DAYS + 1,
  );
});

test("occurrence count is inclusive of both ends", () => {
  assert.equal(occurrenceCount({ time: "08:00", endDate: "2026-08-07" }, tenAmOn6Aug), 1);
  assert.equal(occurrenceCount({ time: "08:00", endDate: "2026-08-09" }, tenAmOn6Aug), 3);
});

test("an end date before the first occurrence produces nothing and is refused", () => {
  assert.equal(occurrenceCount({ time: "08:00", endDate: "2026-08-06" }, tenAmOn6Aug), 0);
  assert.deepEqual(
    validateDailyDraft({ time: "08:00", endDate: "2026-08-06" }, tenAmOn6Aug),
    { kind: "endBeforeStart" },
  );
});

test("a span beyond the ceiling is refused", () => {
  assert.deepEqual(
    validateDailyDraft({ time: "08:00", endDate: "2028-08-07" }, tenAmOn6Aug),
    { kind: "tooLong", maxDays: MAX_DAILY_DURATION_DAYS },
  );
});

test("a valid draft has no problem", () => {
  assert.equal(validateDailyDraft({ time: "08:00", endDate: "2026-09-06" }, tenAmOn6Aug), null);
});

test("only zero-padded 24-hour times are accepted, matching the API contract", () => {
  for (const good of ["00:00", "08:00", "09:30", "23:59"]) {
    assert.equal(isValidTime(good), true, good);
  }
  for (const bad of ["8:00", "24:00", "08:60", "8am", "", "08:00:00"]) {
    assert.equal(isValidTime(bad), false, bad);
  }
});

test("dates parse in local time, not as UTC midnight", () => {
  // `new Date("2026-08-07")` is UTC midnight, which is 2026-08-06 for everybody west of
  // Greenwich — an off-by-one-day that would silently shift the whole series.
  const parsed = parseLocalDate("2026-08-07");
  assert.notEqual(parsed, null);
  assert.equal(parsed!.getFullYear(), 2026);
  assert.equal(parsed!.getMonth(), 7);
  assert.equal(parsed!.getDate(), 7);
});

test("malformed dates are rejected rather than coerced", () => {
  assert.equal(parseLocalDate("2026-8-7"), null);
  assert.equal(parseLocalDate("07/08/2026"), null);
  assert.equal(parseLocalDate(""), null);
});

test("the summary states the hour, the count and the range", () => {
  const summary = describeDailySchedule({ time: "08:00", endDate: "2026-09-06" }, tenAmOn6Aug);
  assert.match(summary, /Every day at 08:00/);
  assert.match(summary, /31 meetings/);
  assert.match(summary, /Aug 7/);
  assert.match(summary, /Sep 6/);
});

test("the summary is empty rather than misleading when the draft produces nothing", () => {
  assert.equal(describeDailySchedule({ time: "08:00", endDate: "2026-08-01" }, tenAmOn6Aug), "");
});
