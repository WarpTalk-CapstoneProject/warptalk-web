import assert from "node:assert/strict";
import test from "node:test";

import { resolveMeetingDurationSeconds } from "../room-history-mapping.ts";

/**
 * WT-407 — "Duration = 50h 8m" on a cancelled recurring occurrence.
 *
 * `createdAt` is when the ROW was inserted. A recurring occurrence is created days before its
 * scheduled slot, and cancelling it stamps `endedAt` WITHOUT ever stamping `startedAt` — so
 * `startedAt ?? createdAt` measured the wait, not the meeting.
 *
 * Production confirms the shape exists: translation_rooms with started_at NULL, ended_at set and
 * status CANCELLED, several of them occurrences of one recurring series.
 *
 * `resolveMeetingDurationSeconds` already refused that fallback — its docstring cites "14h for a
 * 20-minute meeting" as the reason. The defect was that only room-history.service.ts used it;
 * my-meetings.service.ts still did the old arithmetic, so the History tab and the Meetings tab
 * disagreed about the same meeting. These pin the rule the shared resolver enforces.
 */

const HOUR = 3600;

test("a cancelled occurrence that never started has no duration", () => {
  // Created two days early, cancelled at its slot. The old code reported ~50h.
  const seconds = resolveMeetingDurationSeconds({
    durationSeconds: null,
    startedAt: null,
    endedAt: "2026-08-16T08:08:00Z",
  });

  assert.equal(
    seconds,
    0,
    "A meeting that never started was given a duration measured from when its row was created.",
  );
});

test("a meeting that really ran is measured from its own start", () => {
  const seconds = resolveMeetingDurationSeconds({
    durationSeconds: null,
    startedAt: "2026-08-15T08:00:00Z",
    endedAt: "2026-08-15T08:25:30Z",
  });

  assert.equal(seconds, 25 * 60 + 30);
});

test("a server-reported duration wins over the timestamps", () => {
  // Dormant today — nothing in the backend writes TranslationRoom.DurationSeconds — but it is the
  // preferred source the moment it does, and it must not be overridden by the fallback.
  const seconds = resolveMeetingDurationSeconds({
    durationSeconds: 90,
    startedAt: "2026-08-15T08:00:00Z",
    endedAt: "2026-08-15T09:00:00Z",
  });

  assert.equal(seconds, 90);
});

test("each occurrence of a series is measured on its own, never accumulated", () => {
  // The ticket's other worry: "Recurring series không được cộng dồn duration". Three occurrences
  // of one daily series, each half an hour, must each report half an hour.
  const occurrences = [
    { startedAt: "2026-08-13T08:00:00Z", endedAt: "2026-08-13T08:30:00Z" },
    { startedAt: "2026-08-14T08:00:00Z", endedAt: "2026-08-14T08:30:00Z" },
    { startedAt: "2026-08-15T08:00:00Z", endedAt: "2026-08-15T08:30:00Z" },
  ];

  for (const occurrence of occurrences) {
    assert.equal(
      resolveMeetingDurationSeconds({ durationSeconds: null, ...occurrence }),
      30 * 60,
    );
  }
});

test("an end before the start cannot produce a negative duration", () => {
  // Clock skew between services is real, and a negative number would format into nonsense.
  const seconds = resolveMeetingDurationSeconds({
    durationSeconds: null,
    startedAt: "2026-08-15T08:30:00Z",
    endedAt: "2026-08-15T08:00:00Z",
  });

  assert.equal(seconds, 0);
});

test("an unfinished meeting has no duration", () => {
  assert.equal(
    resolveMeetingDurationSeconds({ durationSeconds: null, startedAt: "2026-08-15T08:00:00Z", endedAt: null }),
    0,
  );
});

test("a fifty-hour gap between row creation and cancellation is never reported", () => {
  // The literal number QA saw, kept as a test so the regression is recognisable.
  const created = Date.parse("2026-08-14T06:00:00Z");
  const ended = created + 50 * HOUR * 1000 + 8 * 60 * 1000;

  const seconds = resolveMeetingDurationSeconds({
    durationSeconds: null,
    startedAt: null,
    endedAt: new Date(ended).toISOString(),
  });

  assert.notEqual(seconds, 50 * HOUR + 8 * 60, "the 50h 8m from the report came back");
  assert.equal(seconds, 0);
});
