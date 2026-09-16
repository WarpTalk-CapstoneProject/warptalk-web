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

import {
  canAlignToRecording,
  meetingMsFromRecordingSeconds,
  seekTargetSeconds,
} from "../recording-seek.ts";

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

/* ─────────────────────────────────────────────────────────────────────────────────────────────
   The other direction: the recording is playing, and the transcript has to know which line that is.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

test("a position in the recording maps back to the moment in the meeting", () => {
  // 40s into a file that started 30s before the first transcribed word is 10s into the meeting.
  assert.equal(meetingMsFromRecordingSeconds(RECORDING_FIRST, 40), 10_000);
});

test("the lead-in before the first transcribed word is not a moment in the meeting", () => {
  // Null, never 0. Clamping would light up the meeting's first line for the whole half-minute of
  // room noise before anybody spoke, which reads as a highlight stuck on the wrong sentence.
  assert.equal(meetingMsFromRecordingSeconds(RECORDING_FIRST, 10), null);
  // The exact instant the transcript's clock starts is the first moment that exists.
  assert.equal(meetingMsFromRecordingSeconds(RECORDING_FIRST, 30), 0);
});

test("a playhead in a recording that started after the transcript maps back too", () => {
  const transcriptFirst = {
    timelineAnchorAt: "2026-08-20T10:00:00Z",
    recordingStartedAt: "2026-08-20T10:00:30Z",
  };

  assert.equal(meetingMsFromRecordingSeconds(transcriptFirst, 15), 45_000);
});

test("a missing origin means no line is playing, not the first line", () => {
  // Every meeting recorded before WT-473. The follow feature simply does not run for them; it must
  // not run WRONGLY, which is what any substituted origin would produce.
  assert.equal(
    meetingMsFromRecordingSeconds(
      { timelineAnchorAt: null, recordingStartedAt: "2026-08-20T10:00:00Z" },
      40,
    ),
    null,
  );
  assert.equal(
    meetingMsFromRecordingSeconds(
      { timelineAnchorAt: "2026-08-20T10:00:00Z", recordingStartedAt: null },
      40,
    ),
    null,
  );
  assert.equal(meetingMsFromRecordingSeconds({}, 40), null);
});

test("a nonsense playhead is refused", () => {
  // `timeupdate` on an element with no metadata yet reports NaN, and a caller bug can hand over a
  // negative. Neither is a position in the file.
  assert.equal(meetingMsFromRecordingSeconds(RECORDING_FIRST, Number.NaN), null);
  assert.equal(meetingMsFromRecordingSeconds(RECORDING_FIRST, Number.POSITIVE_INFINITY), null);
  assert.equal(meetingMsFromRecordingSeconds(RECORDING_FIRST, -1), null);
});

test("the two directions are exact inverses of one another", () => {
  // The point of keeping the pair in one file. A drift of even a second here is invisible in
  // review and shows up as a highlight that lags the audio by a sentence.
  for (const sources of [
    RECORDING_FIRST,
    { timelineAnchorAt: "2026-08-20T10:00:00Z", recordingStartedAt: "2026-08-20T10:00:30Z" },
  ]) {
    for (const atMs of [0, 1, 999, 45_000, 3_600_000]) {
      const seconds = seekTargetSeconds(sources, atMs);
      if (seconds === null) continue;
      assert.equal(meetingMsFromRecordingSeconds(sources, seconds), atMs);
    }
  }
});

test("canAlignToRecording answers before any particular moment is chosen", () => {
  // The caller uses it to decide whether to OFFER a seek at all, rather than rendering a control
  // that turns out to do nothing on click.
  assert.equal(canAlignToRecording(RECORDING_FIRST), true);
  assert.equal(canAlignToRecording({ timelineAnchorAt: null, recordingStartedAt: "x" }), false);
  assert.equal(canAlignToRecording({}), false);
});
