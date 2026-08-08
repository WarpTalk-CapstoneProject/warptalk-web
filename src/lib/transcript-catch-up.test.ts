import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCatchUpTranscript,
  catchUpSourceText,
  toLiveSegment,
} from "./transcript-catch-up.ts";
import type { TranscriptSegmentDto as LiveSegment } from "../types/realtime.ts";
import type { TranscriptSegmentDto as SavedSegment } from "../types/transcript.ts";

function saved(id: string, text: string, sequenceOrder: number): SavedSegment {
  return {
    id,
    speakerParticipantId: `user-${id}`,
    speakerName: "Demo Host",
    originalText: text,
    originalLanguage: "en",
    startTimeMs: sequenceOrder * 1000,
    endTimeMs: sequenceOrder * 1000 + 800,
    sequenceOrder,
  };
}

function liveSegment(segmentId: string, text: string): LiveSegment {
  return {
    segmentId,
    speakerId: `user-${segmentId}`,
    speakerName: "Demo Host",
    originalText: text,
    originalLanguage: "en",
    confidence: 0.9,
    startTimeMs: 0,
    endTimeMs: 500,
  };
}

/**
 * The two sources describe the same utterances in different shapes — saved keys on `id`,
 * live on `segmentId`. Merging on the wrong key duplicates every line present in both, which
 * is the failure these exist to prevent.
 */

test("someone who joined late reads what they missed, then the live stream", () => {
  const result = buildCatchUpTranscript(
    [saved("a", "First thing", 1), saved("b", "Second thing", 2)],
    [liveSegment("c", "Said after they joined")],
  );

  assert.deepEqual(
    result.segments.map((segment) => segment.originalText),
    ["First thing", "Second thing", "Said after they joined"],
  );
  assert.equal(result.missedCount, 2);
  assert.equal(result.joinedAtSegmentId, "c");
});

test("a line present in both sources appears once, not twice", () => {
  const result = buildCatchUpTranscript(
    [saved("a", "Overlapping line", 1)],
    [liveSegment("a", "Overlapping line")],
  );

  assert.equal(result.segments.length, 1);
  assert.equal(result.missedCount, 0);
});

test("the live copy wins, because it may carry a correction or a translation", () => {
  const result = buildCatchUpTranscript(
    [saved("a", "before correction", 1)],
    [liveSegment("a", "after correction")],
  );

  assert.equal(result.segments[0].originalText, "after correction");
});

test("someone present from the start has missed nothing", () => {
  const result = buildCatchUpTranscript([], [liveSegment("a", "Hello")]);
  assert.equal(result.missedCount, 0);
  assert.equal(result.segments.length, 1);
});

test("history is ordered by sequence, not by the order the API returned it", () => {
  const result = buildCatchUpTranscript(
    [saved("b", "Second", 2), saved("a", "First", 1)],
    [],
  );

  assert.deepEqual(
    result.segments.map((segment) => segment.originalText),
    ["First", "Second"],
  );
});

test("a joiner with nothing live yet still reads the history", () => {
  const result = buildCatchUpTranscript([saved("a", "Earlier", 1)], []);
  assert.equal(result.missedCount, 1);
  assert.equal(result.joinedAtSegmentId, null);
});

test("a saved segment keeps its identity through the shape change", () => {
  const converted = toLiveSegment(saved("a", "Text", 1));
  assert.equal(converted.segmentId, "a");
  assert.equal(converted.speakerId, "user-a");
  // No translation invented: a blank one would render an empty second line under every
  // backfilled utterance.
  assert.equal(converted.translatedText, undefined);
});

test("a saved segment with no speaker id does not become the string 'undefined'", () => {
  const orphan = { ...saved("a", "Text", 1), speakerParticipantId: undefined };
  assert.equal(toLiveSegment(orphan).speakerId, "");
});

test("the summary is written from what was missed, not from the whole meeting", () => {
  const result = buildCatchUpTranscript(
    [saved("a", "Missed this", 1)],
    [liveSegment("b", "Heard this myself")],
  );

  const source = catchUpSourceText(result);
  assert.match(source, /Missed this/);
  assert.ok(!source.includes("Heard this myself"), source);
});
