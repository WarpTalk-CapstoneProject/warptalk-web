/**
 * One mark per transcript turn, on the recording's own file-second axis.
 *
 * The failure that matters here is the same one recording-seek.test.ts guards against: a mark
 * that seeks to the WRONG place is worse than no mark at all, because clicking it looks like it
 * worked. Every case below is either the arithmetic (delegated to seekTargetSeconds, so not
 * re-proven here) or a turn that must be dropped rather than clamped.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildRecordingMarks } from "../recording-marks.ts";

// The host started recording 30 seconds before the first word was transcribed.
const SOURCES = {
  timelineAnchorAt: "2026-08-20T10:00:30Z",
  recordingStartedAt: "2026-08-20T10:00:00Z",
};

test("one mark per turn, positioned on the file's own axis", () => {
  const turns = [{ startTimeMs: 0 }, { startTimeMs: 10_000 }, { startTimeMs: 20_000 }];

  assert.deepEqual(buildRecordingMarks(turns, SOURCES), [
    { atMs: 0, seconds: 30 },
    { atMs: 10_000, seconds: 40 },
    { atMs: 20_000, seconds: 50 },
  ]);
});

test("a turn spoken before the host pressed record is dropped, not clamped to 0:00", () => {
  const transcriptFirst = {
    timelineAnchorAt: "2026-08-20T10:00:00Z",
    recordingStartedAt: "2026-08-20T10:00:30Z",
  };
  const turns = [{ startTimeMs: 5_000 }, { startTimeMs: 45_000 }];

  assert.deepEqual(buildRecordingMarks(turns, transcriptFirst), [{ atMs: 45_000, seconds: 15 }]);
});

test("a turn past the end of a recording that stopped early is dropped, not clamped to the end", () => {
  const sources = { ...SOURCES, durationSeconds: 60 };
  const turns = [{ startTimeMs: 20_000 }, { startTimeMs: 60_000 }];

  assert.deepEqual(buildRecordingMarks(turns, sources), [{ atMs: 20_000, seconds: 50 }]);
});

test("an unaligned meeting yields no marks at all", () => {
  const turns = [{ startTimeMs: 0 }, { startTimeMs: 10_000 }];

  assert.deepEqual(
    buildRecordingMarks(turns, { timelineAnchorAt: null, recordingStartedAt: "2026-08-20T10:00:00Z" }),
    [],
  );
});

test("no turns is no marks", () => {
  assert.deepEqual(buildRecordingMarks([], SOURCES), []);
});
