/**
 * Captions and the transcript are two lanes fed by the same broadcasts. WT-605.
 *
 * Pausing the transcript stops the RECORD. The live subtitle overlay keeps running — the paused
 * banner promises that to the whole room. Both used to read one list, so a gate in front of that
 * list froze captions for every room that had not started translation.
 */

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { useTranslationRoomStore } from "../translationRoom-store.ts";
import type { TranscriptSegmentDto, TranslationTextDto } from "../../types/realtime.ts";

const store = () => useTranslationRoomStore.getState();

const segment = (segmentId: string, originalText: string): TranscriptSegmentDto => ({
  segmentId,
  speakerId: "speaker-1",
  speakerName: "Ngọc Kỳ",
  originalText,
  originalLanguage: "vi",
  confidence: 1,
  startTimeMs: 0,
  endTimeMs: 1000,
});

const translation = (sourceSegmentId: string, translatedText: string): TranslationTextDto =>
  ({
    segmentId: `${sourceSegmentId}-en-c0`,
    sourceSegmentId,
    speakerId: "speaker-1",
    originalText: "Xin chào",
    translatedText,
    sourceLang: "vi",
    targetLang: "en",
    chunkIndex: 0,
  });

const ids = (list: TranscriptSegmentDto[]) => list.map((item) => item.segmentId);

beforeEach(() => {
  store().reset();
});

test("while recording, a segment joins both lanes", () => {
  store().addTranscriptSegment(segment("a", "Hello"));

  assert.deepEqual(ids(store().captionSegments), ["a"]);
  assert.deepEqual(ids(store().transcriptSegments), ["a"]);
});

test("THE REPORTED BUG: while paused, captions keep moving and the transcript does not", () => {
  store().addTranscriptSegment(segment("a", "Hello"));
  store().setTranscriptPaused(true);

  store().addTranscriptSegment(segment("b", "Said while paused"));

  assert.deepEqual(ids(store().captionSegments), ["a", "b"]);
  assert.deepEqual(ids(store().transcriptSegments), ["a"]);
  assert.equal(store().withheldWhilePaused, 1);
});

test("a translation of paused speech is a caption, never a new transcript line", () => {
  store().setTranscriptPaused(true);

  store().addOrMergeTranslationText(translation("p", "Said while paused"));

  assert.deepEqual(ids(store().captionSegments), ["p"]);
  assert.deepEqual(store().transcriptSegments, []);
});

test("a late translation of a line said before the pause still reaches the transcript", () => {
  store().addTranscriptSegment(segment("a", "Xin chào"));
  store().setTranscriptPaused(true);

  store().addOrMergeTranslationText(translation("a", "Hello"));

  assert.equal(store().transcriptSegments[0].translations?.en, "Hello");
  assert.equal(store().captionSegments[0].translations?.en, "Hello");
});

test("a revision of a recorded line keeps updating it during a pause", () => {
  store().addTranscriptSegment(segment("a", "Hel"));
  store().setTranscriptPaused(true);

  store().addTranscriptSegment(segment("a", "Hello"));

  assert.equal(store().transcriptSegments[0].originalText, "Hello");
  assert.equal(store().withheldWhilePaused, 0);
});

test("Resume sends new lines to the transcript again, and nothing withheld comes back", () => {
  store().setTranscriptPaused(true);
  store().addTranscriptSegment(segment("b", "Said while paused"));

  store().setTranscriptPaused(false);
  store().addTranscriptSegment(segment("c", "After resume"));

  assert.deepEqual(ids(store().transcriptSegments), ["c"]);
  assert.deepEqual(ids(store().captionSegments), ["b", "c"]);
  assert.equal(store().withheldWhilePaused, 0);
});

test("a repeated pause signal does not reset the withheld count", () => {
  store().setTranscriptPaused(true);
  store().addTranscriptSegment(segment("b", "Said while paused"));

  store().setTranscriptPaused(true);

  assert.equal(store().withheldWhilePaused, 1);
});
