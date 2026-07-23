import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTranscriptTimestamp,
  getAnimatedWordTokens,
  getLiveCaptionText,
  groupTranscriptSegments,
  resolveTranscriptSpeakerName,
} from "./transcript-display.ts";
import type { ParticipantInfoDto, TranscriptSegmentDto } from "../types/realtime.ts";

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
