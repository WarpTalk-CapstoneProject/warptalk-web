/**
 * The live transcript and captions follow the meeting clock, not arrival order.
 *
 * The owner's rule: a later sentence never shows above an earlier one. Lines do not arrive in
 * speech order — two speakers are transcribed in parallel, a translation is held for its
 * predecessor, a retried line comes back late — and the store used to append every new line at
 * the end. It now inserts a new line by `startTimeMs` (room anchor clock, WT-421).
 *
 * Also pinned: translated sentences of one line fill their own `-c{n}` slot. `chunkIndex` on the
 * wire is the STT audio-chunk counter, not the sentence number, so for a track's first chunk the
 * second sentence used to REPLACE the first.
 */

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { LATE_LINE_WINDOW_MS, useTranslationRoomStore } from "../translationRoom-store.ts";
import type { TranscriptSegmentDto, TranslationTextDto } from "../../types/realtime.ts";

const store = () => useTranslationRoomStore.getState();

const line = (segmentId: string, startTimeMs: number, speakerId = "speaker-1"): TranscriptSegmentDto => ({
  segmentId,
  speakerId,
  speakerName: "Ngọc Kỳ",
  originalText: `text ${segmentId}`,
  originalLanguage: "vi",
  confidence: 1,
  startTimeMs,
  endTimeMs: startTimeMs + 1000,
});

const sentence = (
  sourceSegmentId: string,
  index: number,
  translatedText: string,
  chunkIndex = 0,
): TranslationTextDto =>
  ({
    segmentId: `${sourceSegmentId}-en-c${index}`,
    sourceSegmentId,
    speakerId: "speaker-1",
    originalText: "nguồn",
    translatedText,
    sourceLang: "vi",
    targetLang: "en",
    startTimeMs: 1000,
    endTimeMs: 2000,
    chunkIndex,
  }) as TranslationTextDto;

const ids = (segments: TranscriptSegmentDto[]) => segments.map((segment) => segment.segmentId);

beforeEach(() => store().reset());

test("a line that arrives late is shown where it was spoken, in both lanes", () => {
  store().addTranscriptSegment(line("a", 1_000));
  store().addTranscriptSegment(line("c", 9_000));
  store().addTranscriptSegment(line("b", 5_000));

  assert.deepEqual(ids(store().transcriptSegments), ["a", "b", "c"]);
  assert.deepEqual(ids(store().captionSegments), ["a", "b", "c"]);
});

test("lines that started together keep their arrival order", () => {
  store().addTranscriptSegment(line("first", 4_000));
  store().addTranscriptSegment(line("second", 4_000));
  store().addTranscriptSegment(line("earlier", 2_000));

  assert.deepEqual(ids(store().transcriptSegments), ["earlier", "first", "second"]);
});

test("a revision of a line replaces it in place", () => {
  store().addTranscriptSegment(line("a", 1_000));
  store().addTranscriptSegment(line("b", 5_000));
  store().addTranscriptSegment({ ...line("a", 1_000), originalText: "revised" });

  assert.deepEqual(ids(store().transcriptSegments), ["a", "b"]);
  assert.equal(store().transcriptSegments[0].originalText, "revised");
});

test("a line on a restarted clock is appended, not buried minutes up", () => {
  store().addTranscriptSegment(line("a", 600_000));
  store().addTranscriptSegment(line("b", 700_000));
  store().addTranscriptSegment(line("restart", 700_000 - LATE_LINE_WINDOW_MS - 1));

  assert.deepEqual(ids(store().transcriptSegments), ["a", "b", "restart"]);
});

test("a translation that starts its own line is placed by its start time too", () => {
  store().addTranscriptSegment(line("a", 1_000));
  store().addTranscriptSegment(line("c", 9_000));
  store().addOrMergeTranslationText({ ...sentence("b", 0, "Hello"), startTimeMs: 5_000 });

  assert.deepEqual(ids(store().captionSegments), ["a", "b", "c"]);
});

test("sentences of one line fill their own slots, whatever order they arrive in", () => {
  store().addTranscriptSegment(line("a", 1_000));
  // chunkIndex 0 is a track's first audio chunk: the second sentence used to replace the first.
  store().addOrMergeTranslationText(sentence("a", 1, "How are you?"));
  store().addOrMergeTranslationText(sentence("a", 0, "Hello."));
  store().addOrMergeTranslationText(sentence("a", 1, "How are you?"));

  assert.equal(store().transcriptSegments[0].translations?.en, "Hello. How are you?");
});
