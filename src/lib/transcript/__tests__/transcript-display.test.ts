import assert from "node:assert/strict";
import test from "node:test";

import {
  captionTextForReader,
  dedupeTranscriptSegments,
  findSuggestionForUtterance,
  confidencePercent,
  formatTranscriptTimestamp,
  getAnimatedWordTokens,
  getLiveCaptionText,
  groupSavedTranscriptSegments,
  groupTranscriptSegments,
  isTranscriptControlMarker,
  resolveSegmentTranslation,
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

// WT-371 Bug 3. stt_worker publishes `confidence=round(avg_logprob, 4)` — an average token
// LOG-probability, at most 0 and usually negative. The panel multiplied it by 100 and rendered
// "-23%": a number with no meaning, in a unit it does not have.
test("a negative log-probability becomes a real percentage", () => {
  assert.equal(confidencePercent(-0.23), 79);
  assert.equal(confidencePercent(-0.7), 50);
});

test("a perfect score is 100%, not a negative", () => {
  assert.equal(confidencePercent(-0.0001), 100);
});

test("a value already in 0..1 is not exponentiated twice", () => {
  // Reading a plain probability as a logprob would turn 0.8 into 122%.
  assert.equal(confidencePercent(0.8), 80);
});

test("nothing reported renders nothing, never a confident 0% or 100%", () => {
  assert.equal(confidencePercent(null), null);
  assert.equal(confidencePercent(undefined), null);
  assert.equal(confidencePercent(0), null);
  assert.equal(confidencePercent(Number.NaN), null);
});

// ── WT-371 Bug 4: the transcript reads from ONE seat ────────────────────────────────────────
//
// A room with A (speak en / listen vi) and B (speak vi / listen en) translates into both
// languages, and the gateway fans both to the whole group. The panel used to keep one
// translation per bubble, overwritten by whichever landed last, so which direction a line
// showed depended on arrival order and on when the reader's own listen language finished
// resolving — "English → Vietnamese" above "Vietnamese → English", in one panel.

test("a line resolves into the reader's language, not into whichever arrived last", () => {
  const line = segment({
    originalLanguage: "en",
    translations: { vi: "Xin chào", ja: "こんにちは" },
    // Left over from an unrelated listener. Reading this is the defect.
    translatedText: "こんにちは",
    targetLanguage: "ja",
  });

  assert.equal(resolveSegmentTranslation(line, "vi"), "Xin chào");
  assert.equal(resolveSegmentTranslation(line, "ja"), "こんにちは");
});

test("a regional tag reads the same entry as its base language", () => {
  // The picker offers "en-US"; the worker publishes "en". Unnormalized these are two keys and
  // the lookup silently misses, which renders as a line that never got translated.
  const line = segment({ originalLanguage: "vi", translations: { en: "Hello" } });

  assert.equal(resolveSegmentTranslation(line, "en-US"), "Hello");
});

test("nothing is shown when the speaker already spoke the reader's language", () => {
  // B speaks Vietnamese; A reads Vietnamese. There is nothing to translate, and echoing the
  // same sentence under itself is how "→ Vietnamese" ended up beneath a Vietnamese line.
  const line = segment({ originalLanguage: "vi", translations: { en: "Hello" } });

  assert.equal(resolveSegmentTranslation(line, "vi"), null);
});

test("a translation for somebody else's language is not borrowed", () => {
  const line = segment({ originalLanguage: "en", translations: { ja: "こんにちは" } });

  assert.equal(resolveSegmentTranslation(line, "vi"), null);
});

test("a legacy inline translation counts only for the language it was made for", () => {
  const legacy = segment({
    originalLanguage: "en",
    translations: undefined,
    translatedText: "Xin chào",
    targetLanguage: "vi",
  });

  assert.equal(resolveSegmentTranslation(legacy, "vi"), "Xin chào");
  assert.equal(resolveSegmentTranslation(legacy, "ja"), null);
});

test("merging two chunks unions their languages instead of splicing them together", () => {
  // The old merge concatenated a single translatedText slot, so a bubble carrying Vietnamese
  // followed by one carrying Japanese produced one string of both.
  const [utterance] = groupTranscriptSegments([
    segment({
      segmentId: "s1",
      originalText: "Hello",
      translations: { vi: "Xin chào", ja: "こんにちは" },
    }),
    segment({
      segmentId: "s2",
      originalText: "how are you?",
      startTimeMs: 2_100,
      endTimeMs: 3_000,
      translations: { vi: "bạn khỏe không?" },
    }),
  ]);

  assert.equal(utterance.translations?.vi, "Xin chào bạn khỏe không?");
  assert.equal(utterance.translations?.ja, "こんにちは");
});

test("one speaker's continuous sentence stays one bubble across several languages", () => {
  // The merge used to refuse when two segments' targetLanguage differed. With the room
  // translating into more than one language that split every utterance in half.
  const utterances = groupTranscriptSegments([
    segment({ segmentId: "s1", translations: { vi: "Xin chào" }, targetLanguage: "vi" }),
    segment({
      segmentId: "s2",
      startTimeMs: 2_100,
      endTimeMs: 3_000,
      translations: { ja: "こんにちは" },
      targetLanguage: "ja",
    }),
  ]);

  assert.equal(utterances.length, 1);
});


// ── the caption lane's own language rule ────────────────────────────────────────────────────
//
// Reversed on 2026-08-20 by the product owner. The lane rendered originalText unconditionally,
// so a reader listening in English watched Vietnamese captions scroll past while their English
// sat one tab away in the transcript panel.
//
// The subtle half is that resolveSegmentTranslation returns null for two OPPOSITE situations,
// and the lane has to tell them apart: "there was nothing to translate" must still be
// captioned, "the translation has not arrived yet" must not.

test("a reader sees the caption in their own language, not the speaker's", () => {
  const line = segment({
    originalLanguage: "vi",
    originalText: "Xin chào",
    translations: { en: "Hello" },
  });

  assert.equal(captionTextForReader(line, "en"), "Hello");
});

test("a speaker already in the reader's language is captioned, not held back", () => {
  // THE CASE THAT WOULD EMPTY THE LANE. No translation is ever produced for a matched pair —
  // the pipeline drops it as same_language_targets_dropped — so requiring one would leave a
  // room where everybody shares a language with no captions at all, and would stop anyone ever
  // seeing their own words.
  const line = segment({
    originalLanguage: "en",
    originalText: "Hello everyone",
    translations: {},
  });

  assert.equal(captionTextForReader(line, "en"), "Hello everyone");
  assert.equal(captionTextForReader(line, "en-US"), "Hello everyone");
});

test("a line whose translation has not arrived yet is held rather than shown in the wrong language", () => {
  // The transcript segment lands before its translation does. Showing the original in the gap is
  // the defect being fixed, not a smaller version of it: the line would go up in the wrong
  // language and then change under the reader.
  const line = segment({
    originalLanguage: "vi",
    originalText: "Xin chào",
    translations: {},
    translatedText: undefined,
    targetLanguage: undefined,
  });

  assert.equal(captionTextForReader(line, "en"), null);
});

test("somebody else's translation is never shown as this reader's caption", () => {
  const line = segment({
    originalLanguage: "vi",
    originalText: "Xin chào",
    translations: { ja: "こんにちは" },
  });

  assert.equal(captionTextForReader(line, "en"), null);
});

test("a reader with no resolved language yet sees the original rather than an empty lane", () => {
  // The first moments of a cold join, before the participant row arrives. A blank caption
  // surface reads as broken, so it is never the answer to "not resolved yet".
  const line = segment({ originalLanguage: "vi", originalText: "Xin chào", translations: {} });

  assert.equal(captionTextForReader(line, null), "Xin chào");
  assert.equal(captionTextForReader(line, ""), "Xin chào");
});
