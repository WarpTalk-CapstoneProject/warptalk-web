import assert from "node:assert/strict";
import test from "node:test";

import {
  dedupeTranscriptSegments,
  findSuggestionForUtterance,
  formatTranscriptTimestamp,
  getAnimatedWordTokens,
  getLiveCaptionText,
  groupSavedTranscriptSegments,
  groupTranscriptSegments,
  isTranscriptControlMarker,
  resolveTranscriptSpeakerName,
} from "../transcript-display.ts";
import type { ParticipantInfoDto, TranscriptSegmentDto } from "../../../types/realtime.ts";

function segment(overrides: Partial<TranscriptSegmentDto> = {}): TranscriptSegmentDto {
  return {
    segmentId: "segment-1",
    speakerId: "speaker-1",
    speakerName: "Alice",
    originalText: "Hello",
    originalLanguage: "en",
    translatedText: "Xin chào",
    targetLanguage: "vi",
    confidence: 0.98,
    startTimeMs: 1_000,
    endTimeMs: 2_000,
    ...overrides,
  };
}

test("groups adjacent chunks from the same speaker into one stable utterance", () => {
  const groups = groupTranscriptSegments([
    segment(),
    segment({
      segmentId: "segment-2",
      originalText: "how are you?",
      translatedText: "bạn khỏe không?",
      startTimeMs: 2_200,
      endTimeMs: 3_100,
    }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].segmentId, "segment-1");
  assert.equal(groups[0].originalText, "Hello how are you?");
  assert.equal(groups[0].translatedText, "Xin chào bạn khỏe không?");
  assert.equal(groups[0].endTimeMs, 3_100);
});

test("keeps arrival order when a reconnected audio track resets its relative timestamp", () => {
  const ordered = dedupeTranscriptSegments([
    segment({ segmentId: "before-reconnect", startTimeMs: 48_000, originalText: "Before" }),
    segment({ segmentId: "after-reconnect", startTimeMs: 0, originalText: "After" }),
    segment({
      segmentId: "before-reconnect",
      startTimeMs: 48_000,
      originalText: "Before updated",
    }),
  ]);

  assert.deepEqual(
    ordered.map((item) => item.segmentId),
    ["before-reconnect", "after-reconnect"],
  );
  assert.equal(ordered[0].originalText, "Before updated");
});

test("keeps a new STT chunk in the current utterance while its translation is pending", () => {
  const groups = groupTranscriptSegments([
    segment(),
    segment({
      segmentId: "segment-2",
      originalText: "still speaking",
      translatedText: undefined,
      targetLanguage: undefined,
      startTimeMs: 2_100,
      endTimeMs: 2_900,
    }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].originalText, "Hello still speaking");
});

test("starts a new utterance when the speaker changes or pauses", () => {
  const groups = groupTranscriptSegments([
    segment(),
    segment({ segmentId: "segment-2", speakerId: "speaker-2", speakerName: "Bob", startTimeMs: 2_100 }),
    segment({ segmentId: "segment-3", startTimeMs: 8_000, endTimeMs: 9_000 }),
  ]);

  assert.deepEqual(groups.map((group) => group.segmentId), ["segment-1", "segment-2", "segment-3"]);
});

test("resolves an opaque speaker id to the participant display name", () => {
  const speakerId = "d5542ad6-d66c-4fe7-8baa-3f55cf9c6b30";
  const participants: ParticipantInfoDto[] = [
    {
      userId: speakerId,
      displayName: "Nguyễn An",
      speakLanguage: "vi",
      listenLanguage: "en",
      isMuted: false,
      joinedAt: "2026-07-23T00:00:00Z",
    },
  ];

  assert.equal(
    resolveTranscriptSpeakerName(segment({ speakerId, speakerName: speakerId }), participants),
    "Nguyễn An",
  );
  assert.equal(resolveTranscriptSpeakerName(segment({ speakerId, speakerName: speakerId }), []), "Speaker");
});

test("keeps the live caption focused on the newest words", () => {
  const text = "This is the older beginning of a long live caption that should roll forward as more words arrive";

  assert.equal(getLiveCaptionText(text, 56), "caption that should roll forward as more words arrive");
});

test("keeps existing word keys stable when new words are appended", () => {
  const before = getAnimatedWordTokens("hello from WarpTalk");
  const after = getAnimatedWordTokens("hello from WarpTalk everyone");

  assert.deepEqual(after.slice(0, before.length), before);
  assert.deepEqual(after.at(-1), { key: "3:everyone", word: "everyone", index: 3 });
});

test("keeps global word keys stable when the live caption window rolls forward", () => {
  const tokens = getAnimatedWordTokens("one two three four five six", 14);

  assert.deepEqual(tokens, [
    { key: "3:four", word: "four", index: 3 },
    { key: "4:five", word: "five", index: 4 },
    { key: "5:six", word: "six", index: 5 },
  ]);
});

test("formats AI worker offsets as meeting-relative transcript timestamps", () => {
  assert.equal(formatTranscriptTimestamp(0), "0:00");
  assert.equal(formatTranscriptTimestamp(65_000), "1:05");
  assert.equal(formatTranscriptTimestamp(3_723_000), "1:02:03");
});

test("records every merged segment id so a suggestion can find its bubble", () => {
  const groups = groupTranscriptSegments([
    segment(),
    segment({ segmentId: "segment-2", originalText: "how are you?", startTimeMs: 2_200, endTimeMs: 3_100 }),
    segment({ segmentId: "segment-3", originalText: "still there?", startTimeMs: 3_300, endTimeMs: 4_000 }),
  ]);

  assert.equal(groups.length, 1);
  // The bubble is still identified by the FIRST segment — the other two ids survive only here.
  assert.equal(groups[0].segmentId, "segment-1");
  assert.deepEqual(groups[0].mergedSegmentIds, ["segment-1", "segment-2", "segment-3"]);
});

test("starts a fresh merged id list for each separate utterance", () => {
  const groups = groupTranscriptSegments([
    segment(),
    segment({ segmentId: "segment-2", speakerId: "speaker-2", startTimeMs: 5_000, endTimeMs: 6_000 }),
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].mergedSegmentIds, ["segment-1"]);
  assert.deepEqual(groups[1].mergedSegmentIds, ["segment-2"]);
});

test("finds a suggestion anchored to a segment that was merged away", () => {
  const [utterance] = groupTranscriptSegments([
    segment(),
    segment({ segmentId: "segment-2", originalText: "how are you?", startTimeMs: 2_200, endTimeMs: 3_100 }),
  ]);

  // This is the case a plain `suggestions[utterance.segmentId]` lookup silently misses:
  // the worker anchored to segment-2, but the rendered bubble is keyed by segment-1.
  assert.equal(findSuggestionForUtterance(utterance, { "segment-2": "hint" }), "hint");
  assert.equal(findSuggestionForUtterance(utterance, { "segment-1": "hint" }), "hint");
  assert.equal(findSuggestionForUtterance(utterance, { "segment-9": "hint" }), undefined);
});

test("returns the earliest suggestion when a merged utterance has more than one", () => {
  const [utterance] = groupTranscriptSegments([
    segment(),
    segment({ segmentId: "segment-2", originalText: "how are you?", startTimeMs: 2_200, endTimeMs: 3_100 }),
  ]);

  assert.equal(
    findSuggestionForUtterance(utterance, { "segment-1": "first", "segment-2": "second" }),
    "first",
  );
});

// ── Control markers are not dialogue ────────────────────────────────────────
//
// `__MEETING_END__` is published onto the STT stream by the meeting service so the AI
// assistant worker knows to write the summary. It was rendering in the transcript as a line
// spoken by "System" at 00:00, with a pencil beside it inviting the host to correct it.

function savedSegment(text: string, sequenceOrder: number, speakerName = "Demo Host") {
  return {
    id: `seg-${sequenceOrder}`,
    speakerName,
    originalText: text,
    originalLanguage: "en",
    startTimeMs: sequenceOrder * 1000,
    endTimeMs: sequenceOrder * 1000 + 500,
    sequenceOrder,
  };
}

test("recognises a control marker, whatever the marker is called", () => {
  for (const marker of ["__MEETING_END__", "  __MEETING_END__  ", "__TRANSLATION_STARTED__"]) {
    assert.equal(isTranscriptControlMarker(marker), true, marker);
  }
});

test("does not mistake real speech for a control marker", () => {
  for (const speech of ["Meeting end", "__meeting_end__", "the __MEETING_END__ marker", "", "Hello"]) {
    assert.equal(isTranscriptControlMarker(speech), false, JSON.stringify(speech));
  }
});

test("a control marker never reaches the rendered transcript", () => {
  const grouped = groupSavedTranscriptSegments([
    savedSegment("Hello everyone", 1),
    savedSegment("__MEETING_END__", 2, "System"),
  ]);

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].originalText, "Hello everyone");
});

test("a control marker is not swallowed into the line before it", () => {
  // Dropping it during grouping rather than after is what stops it being appended to a
  // neighbouring utterance and becoming part of a real line's text.
  const grouped = groupSavedTranscriptSegments([
    savedSegment("Thanks all", 1),
    savedSegment("__MEETING_END__", 2),
  ]);

  assert.equal(grouped.length, 1);
  assert.ok(!grouped[0].originalText.includes("MEETING_END"), grouped[0].originalText);
});

test("a participant whose display name is their own id is not a name", () => {
  // After a sign-out and sign-in the roster can come back holding the user id as the display
  // name, and this branch trusted it absolutely — so a transcript attributed lines to
  // "019f0d00-0de0-7000-9000-000000000003". The supplied-name branch had guarded against
  // exactly this for its own input all along.
  const speakerId = "019f0d00-0de0-7000-9000-000000000003";
  assert.equal(
    resolveTranscriptSpeakerName(
      { speakerId, speakerName: null } as never,
      [{ userId: speakerId, displayName: speakerId }],
    ),
    "Speaker",
  );
});

test("a real display name still wins", () => {
  const speakerId = "019f0d00-0de0-7000-9000-000000000003";
  assert.equal(
    resolveTranscriptSpeakerName(
      { speakerId, speakerName: null } as never,
      [{ userId: speakerId, displayName: "Huỳnh Ngọc Kỳ" }],
    ),
    "Huỳnh Ngọc Kỳ",
  );
});

// The marker was filtered in the SAVED transcript and not in the LIVE one, so it was invisible
// on the room detail page and perfectly visible in the panel during the meeting — attributed to
// "System", timestamped 0:00, with a 100% confidence badge beside it. One filter, two paths,
// only one of them wired.

test("the live grouping drops control markers, like the saved one does", () => {
  const grouped = groupTranscriptSegments([
    segment({ segmentId: "s1", originalText: "Hello everyone" }),
    segment({ segmentId: "s2", speakerId: "system", speakerName: "System", originalText: "__MEETING_END__" }),
  ]);

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].originalText, "Hello everyone");
});

test("a marker is dropped BEFORE it can be merged into a real line", () => {
  // The order is what matters. Absorbed into a neighbouring utterance, the marker stops being a
  // segment of its own and becomes part of somebody's sentence, where no later filter finds it.
  const grouped = groupTranscriptSegments([
    segment({ segmentId: "s1", originalText: "Thanks all" }),
    segment({ segmentId: "s2", originalText: "__MEETING_END__" }),
  ]);

  assert.ok(
    !grouped.some((utterance) => utterance.originalText.includes("MEETING_END")),
    JSON.stringify(grouped.map((u) => u.originalText)),
  );
});

test("a live transcript that is nothing but markers renders as empty, not as noise", () => {
  assert.deepEqual(groupTranscriptSegments([segment({ originalText: "__MEETING_END__" })]), []);
});
