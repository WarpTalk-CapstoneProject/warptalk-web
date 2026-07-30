import assert from "node:assert/strict";
import test from "node:test";

import { calculateMeetingDurationSeconds } from "./meeting-duration.ts";

test("calculates an ended meeting from createdAt to endedAt", () => {
  assert.equal(
    calculateMeetingDurationSeconds(
      "2026-07-29T01:00:00.000Z",
      "2026-07-29T02:15:30.000Z",
    ),
    4530,
  );
});

test("calculates an active meeting from createdAt to now", () => {
  assert.equal(
    calculateMeetingDurationSeconds(
      "2026-07-29T01:00:00.000Z",
      undefined,
      Date.parse("2026-07-29T01:02:03.900Z"),
    ),
    123,
  );
});

test("clamps invalid or negative durations to zero", () => {
  assert.equal(calculateMeetingDurationSeconds("invalid", undefined, 1_000), 0);
  assert.equal(
    calculateMeetingDurationSeconds(
      "2026-07-29T02:00:00.000Z",
      "2026-07-29T01:00:00.000Z",
    ),
    0,
  );
});
