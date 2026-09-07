import assert from "node:assert/strict";
import test from "node:test";

import {
  captionTextForReader,
  pendingCorrections,
  dedupeTranscriptSegments,
  findSuggestionForUtterance,
  confidencePercent,
  formatTranscriptTimestamp,
  getAnimatedWordTokens,
  getLiveCaptionText,
  groupIntoSpeakerTurns,
  groupSavedTranscriptSegments,
  groupTranscriptSegments,
  isTranscriptControlMarker,
  resolveSegmentTranslation,
  resolveTranscriptSpeakerName,
  resolveTranscriptPauseGaps,
  splitSegmentsAroundPauseGaps,
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
  // "__MEETING_END__a" is a real row in production: 1 corrupted sentinel among 156 clean ones.
  // With the old `$` anchor it rendered as a line of dialogue attributed to "System", and it
  // would now also put "system" in the transcript's language picker.
  for (const marker of [
    "__MEETING_END__",
    "  __MEETING_END__  ",
    "__TRANSLATION_STARTED__",
    "__MEETING_END__a",
  ]) {
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

function turnLine(
  id: string,
  speaker: string,
  startTimeMs: number,
  endTimeMs = startTimeMs + 1_000,
) {
  return { id, speakerName: speaker, speakerParticipantId: speaker, startTimeMs, endTimeMs };
}

test("a speaker turn ends when somebody else speaks", () => {
  const turns = groupIntoSpeakerTurns([
    turnLine("s1", "Tuan", 0),
    turnLine("s2", "Tuan", 2_000),
    turnLine("s3", "Ky", 4_000),
  ]);

  assert.deepEqual(turns.map((turn) => turn.speakerName), ["Tuan", "Ky"]);
  assert.deepEqual(turns[0].lines.map((line) => line.id), ["s1", "s2"]);
  assert.equal(turns[0].key, "s1");
  assert.equal(turns[0].startTimeMs, 0);
});

test("a long silence starts a new turn even for the same speaker", () => {
  // Otherwise a 40-minute presentation is one dot on a rail whose whole job is to show the
  // shape of the meeting.
  const turns = groupIntoSpeakerTurns([
    turnLine("s1", "Tuan", 0),
    turnLine("s2", "Tuan", 90_000),
  ]);

  assert.equal(turns.length, 2);
});

test("a reconnect does not become a turn boundary", () => {
  // startTimeMs is an offset into the audio ingress track and resets when that track
  // reconnects, so the gap between two consecutive lines can be negative. That is a dropped
  // connection, not thirty seconds of silence.
  const turns = groupIntoSpeakerTurns([
    turnLine("s1", "Tuan", 600_000),
    turnLine("s2", "Tuan", 0),
  ]);

  assert.equal(turns.length, 1);
});

test("a speaker with no participant id is still one speaker", () => {
  const turns = groupIntoSpeakerTurns([
    { id: "s1", speakerName: "Tuan", speakerParticipantId: null, startTimeMs: 0, endTimeMs: 1_000 },
    { id: "s2", speakerName: "Tuan", speakerParticipantId: null, startTimeMs: 2_000, endTimeMs: 3_000 },
  ]);

  assert.equal(turns.length, 1);
  assert.equal(turns[0].speakerId, null);
});

test("a line with no speaker name at all is attributed to nobody, not to blank", () => {
  const turns = groupIntoSpeakerTurns([
    { id: "s1", speakerName: null, speakerParticipantId: null, startTimeMs: 0, endTimeMs: 1_000 },
  ]);

  assert.equal(turns[0].speakerName, "Unknown speaker");
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

test("before Start Translation the caption is what was said, not an empty lane", () => {
  // Transcription does not wait for translation: livekit_ingress_worker joins on the first
  // published microphone and translation_worker is the stage gated behind Start Translation
  // (`translation_skipped_not_started`). So for the whole pre-Start half of a meeting there are
  // segments and there will never be a translation of them. Holding those lines emptied the lane
  // completely — the same class of failure as WT-387, one layer up.
  const line = segment({
    originalLanguage: "vi",
    originalText: "Xin chào",
    translations: {},
    translatedText: undefined,
    targetLanguage: undefined,
  });

  assert.equal(captionTextForReader(line, "en", false), "Xin chào");
  // ...and the hold comes straight back once translation is running.
  assert.equal(captionTextForReader(line, "en", true), null);
});

test("a translation already in hand is shown whether or not translation is still running", () => {
  // Stop Translation does not retroactively unsay what was already translated.
  const line = segment({
    originalLanguage: "vi",
    originalText: "Xin chào",
    translations: { en: "Hello" },
  });

  assert.equal(captionTextForReader(line, "en", false), "Hello");
});

test("a reader with no resolved language yet sees the original rather than an empty lane", () => {
  // The first moments of a cold join, before the participant row arrives. A blank caption
  // surface reads as broken, so it is never the answer to "not resolved yet".
  const line = segment({ originalLanguage: "vi", originalText: "Xin chào", translations: {} });

  assert.equal(captionTextForReader(line, null), "Xin chào");
  assert.equal(captionTextForReader(line, ""), "Xin chào");
});

// ── WT-589: which batch edits are actually corrections ──────────────────────────────────────
//
// Every survivor of this filter becomes an immutable transcript_corrections row AND a
// re-translation of that line into every target language, so a false positive is not a wasted
// request — it is a revision that changed nothing, multiplied by the length of the meeting.

const line = (id: string, originalText: string) => ({ id, originalText });

test("a line nobody touched is not a correction", () => {
  const segments = [line("a", "Xin chào"), line("b", "Cảm ơn")];

  assert.deepEqual(pendingCorrections(segments, {}), []);
});

test("a draft identical to what is stored is not a correction", () => {
  // Tabbing through a transcript opens every field. Without this, reviewing a meeting and
  // changing nothing would file a revision for every line in it.
  const segments = [line("a", "Xin chào")];

  assert.deepEqual(pendingCorrections(segments, { a: "Xin chào" }), []);
  // ...and whitespace is what a caret leaves behind, not an edit.
  assert.deepEqual(pendingCorrections(segments, { a: "  Xin chào  " }), []);
});

test("an emptied line is left alone rather than blanked", () => {
  // There is no delete on this path. An empty draft is somebody mid-retype or an accidental
  // clear; writing a blank sentence over the stored one is the wrong answer to both.
  const segments = [line("a", "Xin chào")];

  assert.deepEqual(pendingCorrections(segments, { a: "" }), []);
  assert.deepEqual(pendingCorrections(segments, { a: "   " }), []);
});

test("only the changed lines are posted, and in transcript order", () => {
  const segments = [line("a", "Xin chào"), line("b", "Cảm ơn"), line("c", "Tạm biệt")];

  const pending = pendingCorrections(segments, { a: "Xin chào bạn", c: "Tạm biệt nhé" });

  assert.deepEqual(pending.map((segment) => segment.id), ["a", "c"]);
});

// ── WT-605: Pause Transcript dividers ────────────────────────────────────────────────────────
//
// A pause window's wall-clock StartedAt/EndedAt has to land at the right point among segments
// whose own timestamps are meeting-RELATIVE ms (segment.startTimeMs) — the same conversion
// groupSegmentsByTranslationSession already does for "Translation N" dividers, via `baseTime`.

const BASE_TIME = "2026-09-03T10:00:00.000Z";

function pauseWindow(startOffsetMs: number, endOffsetMs: number | null, id = "w1") {
  const base = new Date(BASE_TIME).getTime();
  return {
    id,
    translationRoomId: "room-1",
    startedAt: new Date(base + startOffsetMs).toISOString(),
    endedAt: endOffsetMs === null ? null : new Date(base + endOffsetMs).toISOString(),
  };
}

test("resolveTranscriptPauseGaps is empty without a baseTime to anchor against", () => {
  assert.deepEqual(resolveTranscriptPauseGaps([pauseWindow(1000, 2000)], undefined), []);
});

test("resolveTranscriptPauseGaps converts wall-clock windows into meeting-relative ms", () => {
  const gaps = resolveTranscriptPauseGaps([pauseWindow(60_000, 120_000)], BASE_TIME);

  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].startMs, 60_000);
  assert.equal(gaps[0].endMs, 120_000);
});

test("resolveTranscriptPauseGaps leaves endMs null for a window still open", () => {
  const gaps = resolveTranscriptPauseGaps([pauseWindow(60_000, null)], BASE_TIME);

  assert.equal(gaps[0].endMs, null);
});

test("splitSegmentsAroundPauseGaps is a no-op with no gaps", () => {
  const segments = [{ startTimeMs: 0 }, { startTimeMs: 5000 }];

  const blocks = splitSegmentsAroundPauseGaps(segments, []);

  assert.deepEqual(blocks, [{ gapBefore: null, segments }]);
});

test("splitSegmentsAroundPauseGaps splits cleanly at the gap boundary", () => {
  // Spoken before the pause, then after it — nothing is ever spoken DURING the gap, since that
  // is exactly what Pause Transcript means: those segments were never persisted at all.
  const segments = [
    { startTimeMs: 1000, id: "before" },
    { startTimeMs: 200_000, id: "after" },
  ];
  const gaps = resolveTranscriptPauseGaps([pauseWindow(60_000, 120_000)], BASE_TIME);

  const blocks = splitSegmentsAroundPauseGaps(segments, gaps);

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].gapBefore, null);
  assert.deepEqual(blocks[0].segments.map((s) => s.id), ["before"]);
  assert.equal(blocks[1].gapBefore, gaps[0]);
  assert.deepEqual(blocks[1].segments.map((s) => s.id), ["after"]);
});

test("splitSegmentsAroundPauseGaps handles a room still paused (no segments after)", () => {
  const segments = [{ startTimeMs: 1000, id: "before" }];
  const gaps = resolveTranscriptPauseGaps([pauseWindow(60_000, null)], BASE_TIME);

  const blocks = splitSegmentsAroundPauseGaps(segments, gaps);

  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].segments.map((s) => s.id), ["before"]);
  assert.equal(blocks[1].gapBefore?.endMs, null);
  assert.deepEqual(blocks[1].segments, []);
});

test("splitSegmentsAroundPauseGaps handles two separate pauses in one meeting", () => {
  const segments = [
    { startTimeMs: 1000, id: "a" },
    { startTimeMs: 200_000, id: "b" },
    { startTimeMs: 400_000, id: "c" },
  ];
  const gaps = resolveTranscriptPauseGaps(
    [pauseWindow(60_000, 120_000, "w1"), pauseWindow(250_000, 350_000, "w2")],
    BASE_TIME,
  );

  const blocks = splitSegmentsAroundPauseGaps(segments, gaps);

  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks.map((b) => b.segments.map((s) => s.id)), [["a"], ["b"], ["c"]]);
  assert.equal(blocks[1].gapBefore?.window.id, "w1");
  assert.equal(blocks[2].gapBefore?.window.id, "w2");
});
