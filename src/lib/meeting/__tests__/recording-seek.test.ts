/**
 * Turning a transcript moment into a recording position.
 *
 * The failure that matters is not "no seek" — it is a seek to the WRONG place, which looks exactly
 * like a working feature. The video plays, somebody hears a different sentence than the line they
 * clicked, and concludes the transcript is lying about who said what. Every case below is either
 * the arithmetic or a refusal to guess.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { canAlignToRecording, seekTargetSeconds } from "../recording-seek.ts";

// The host started recording 30 seconds before the first word was transcribed.
const RECORDING_FIRST = {
  timelineAnchorAt: "2026-08-20T10:00:30Z",
  recordingStartedAt: "2026-08-20T10:00:00Z",
};

test("a moment maps to its position in the recording", () => {
  // 30s of lead-in, plus 10s into the transcript.
  assert.equal(seekTargetSeconds(RECORDING_FIRST, 10_000), 40);
});

test("the very first transcribed word is not the start of the recording", () => {
  // This is the whole reason two origins are stored rather than one.
  assert.equal(seekTargetSeconds(RECORDING_FIRST, 0), 30);
});

test("a recording started AFTER the transcript began offsets the other way", () => {
  const transcriptFirst = {
    timelineAnchorAt: "2026-08-20T10:00:00Z",
    recordingStartedAt: "2026-08-20T10:00:30Z",
  };

  assert.equal(seekTargetSeconds(transcriptFirst, 45_000), 15);
});

test("a moment spoken before the host pressed record is not in the recording", () => {
  // Null, never clamped to 0. Seeking to the start would present the wrong sentence as the right
  // one, which is the failure this module exists to prevent.
  const transcriptFirst = {
    timelineAnchorAt: "2026-08-20T10:00:00Z",
    recordingStartedAt: "2026-08-20T10:00:30Z",
  };

  assert.equal(seekTargetSeconds(transcriptFirst, 5_000), null);
});

test("a moment past the end of a recording that stopped early is not in it either", () => {
  const sources = { ...RECORDING_FIRST, durationSeconds: 60 };

  assert.equal(seekTargetSeconds(sources, 20_000), 50);
  assert.equal(seekTargetSeconds(sources, 60_000), null);
});

test("an unknown duration never rejects anything", () => {
  assert.equal(seekTargetSeconds({ ...RECORDING_FIRST, durationSeconds: null }, 20_000), 50);
  assert.equal(seekTargetSeconds({ ...RECORDING_FIRST, durationSeconds: 0 }, 20_000), 50);
});

test("a missing anchor means cannot align, not align from zero", () => {
  // Every meeting recorded before WT-473 is this case. Substituting createdAt would be off by
  // however long the meeting waited for its first word.
  assert.equal(
    seekTargetSeconds({ timelineAnchorAt: null, recordingStartedAt: "2026-08-20T10:00:00Z" }, 1000),
    null,
  );
});

test("a missing recording start means cannot align either", () => {
  assert.equal(
    seekTargetSeconds({ timelineAnchorAt: "2026-08-20T10:00:00Z", recordingStartedAt: null }, 1000),
    null,
  );
});

test("an unparseable timestamp is missing, not zero", () => {
  assert.equal(
    seekTargetSeconds({ timelineAnchorAt: "sometime", recordingStartedAt: "2026-08-20T10:00:00Z" }, 1000),
    null,
  );
});

test("a nonsense moment is refused", () => {
  assert.equal(seekTargetSeconds(RECORDING_FIRST, -1), null);
  assert.equal(seekTargetSeconds(RECORDING_FIRST, Number.NaN), null);
  assert.equal(seekTargetSeconds(RECORDING_FIRST, Number.POSITIVE_INFINITY), null);
});

test("canAlignToRecording answers before any particular moment is chosen", () => {
  // The caller uses it to decide whether to OFFER a seek at all, rather than rendering a control
  // that turns out to do nothing on click.
  assert.equal(canAlignToRecording(RECORDING_FIRST), true);
  assert.equal(canAlignToRecording({ timelineAnchorAt: null, recordingStartedAt: "x" }), false);
  assert.equal(canAlignToRecording({}), false);
});
