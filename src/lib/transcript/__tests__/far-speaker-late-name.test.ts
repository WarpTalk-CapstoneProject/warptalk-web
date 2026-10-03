/**
 * The late far-speaker name: `TranscriptSegmentSpeakerNamed { segmentId, speakerName }`.
 *
 * Meet's captions name a new speaker about a second after their first words, so the first line
 * after a change of speaker goes out as "Google Meet participants". It is shown at once, and the
 * backend names it in place when the ai worker has seen the hints that followed. These tests hold
 * the rule (applyLateFarSpeakerName), what the live store does with it, how the renamed line
 * regroups, and the saved-row backstop in the catch-up merge.
 */

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  BRIDGE_FAR_SIDE_FALLBACK_NAME,
  BRIDGE_STAND_IN_USER_ID,
  applyLateFarSpeakerName,
  lateFarSpeakerNameFor,
  revisedFarSideSpeakerName,
} from "../speaker-identity.ts";
import { groupTranscriptSegments } from "../transcript-display.ts";
import { buildCatchUpTranscript } from "../transcript-catch-up.ts";
import { useTranslationRoomStore } from "../../../stores/translationRoom-store.ts";
import type { TranscriptSegmentDto, TranslationTextDto } from "../../../types/realtime.ts";
import type { TranscriptSegmentDto as SavedTranscriptSegmentDto } from "../../../types/transcript.ts";

const STAND_IN = BRIDGE_STAND_IN_USER_ID;
const HOST = "019f0d00-0de0-7000-9000-000000000001";
const NOBODY = BRIDGE_FAR_SIDE_FALLBACK_NAME;

function line(
  segmentId: string,
  speakerName: string,
  startTimeMs: number,
  overrides: Partial<TranscriptSegmentDto> = {},
): TranscriptSegmentDto {
  return {
    segmentId,
    speakerId: STAND_IN,
    speakerName,
    originalText: `said ${segmentId}`,
    originalLanguage: "en",
    confidence: 0.9,
    startTimeMs,
    endTimeMs: startTimeMs + 1_000,
    ...overrides,
  };
}

// ── the rule ─────────────────────────────────────────────────────────────────────────────────────

test("the line with that segment id is renamed in place, nothing else about it changes", () => {
  const lines = [
    line("a", "Lan Nguyen", 1_000),
    line("b", NOBODY, 2_000, { translations: { vi: "xin chào" } }),
    line("c", NOBODY, 3_000),
  ];
  const next = applyLateFarSpeakerName(lines, { segmentId: "b", speakerName: "Minh Tran" });

  assert.notEqual(next, lines);
  assert.deepEqual(next.map((item) => item.speakerName), ["Lan Nguyen", "Minh Tran", NOBODY]);
  assert.deepEqual(next[1], { ...lines[1], speakerName: "Minh Tran" });
  // Only the renamed line is a new object, so nothing else re-renders.
  assert.equal(next[0], lines[0]);
  assert.equal(next[2], lines[2]);
  // The input is not touched.
  assert.equal(lines[1].speakerName, NOBODY);
});

test("an unknown segment id changes nothing and hands back the same array", () => {
  const lines = [line("a", NOBODY, 1_000)];
  assert.equal(applyLateFarSpeakerName(lines, { segmentId: "zzz", speakerName: "Minh Tran" }), lines);
  assert.equal(applyLateFarSpeakerName([], { segmentId: "a", speakerName: "Minh Tran" }).length, 0);
  assert.equal(applyLateFarSpeakerName(lines, { segmentId: "", speakerName: "Minh Tran" }), lines);
  assert.equal(applyLateFarSpeakerName(lines, null), lines);
});

test("a real name is never overwritten", () => {
  const lines = [line("a", "Lan Nguyen", 1_000)];
  assert.equal(applyLateFarSpeakerName(lines, { segmentId: "a", speakerName: "Minh Tran" }), lines);
});

test("every spelling of nobody counts as nobody: the wire fallback, the seat, a GUID, empty", () => {
  for (const nobody of [NOBODY, "google meet participants", "External Meeting", STAND_IN, "", "  "]) {
    const lines = [line("a", nobody, 1_000)];
    const next = applyLateFarSpeakerName(lines, { segmentId: "a", speakerName: "Minh Tran" });
    assert.equal(next[0].speakerName, "Minh Tran", `"${nobody}" should be renamed`);
  }
});

test("a late name that is itself nobody is not a name", () => {
  const lines = [line("a", NOBODY, 1_000)];
  for (const nobody of [NOBODY, "External Meeting", STAND_IN, "", "   ", null, undefined]) {
    assert.equal(applyLateFarSpeakerName(lines, { segmentId: "a", speakerName: nobody }), lines);
  }
});

test("only a stand-in line is named — a WarpTalk participant's line is never touched", () => {
  const lines = [line("a", NOBODY, 1_000, { speakerId: HOST })];
  assert.equal(applyLateFarSpeakerName(lines, { segmentId: "a", speakerName: "Minh Tran" }), lines);
});

test("idempotent: a redelivered event is a no-op with the same reference", () => {
  const lines = [line("a", NOBODY, 1_000)];
  const once = applyLateFarSpeakerName(lines, { segmentId: "a", speakerName: "Minh Tran" });
  const twice = applyLateFarSpeakerName(once, { segmentId: "a", speakerName: "Minh Tran" });
  assert.equal(twice, once);
  // ...and a different second answer does not replace the first one either.
  assert.equal(applyLateFarSpeakerName(once, { segmentId: "a", speakerName: "Lan Nguyen" }), once);
});

test("the segment id matches whatever case either side printed the GUID in; the name is trimmed", () => {
  const id = "0192F0A1-7C2C-46BC-A186-3432A6B3D2F8";
  const lines = [line(id, NOBODY, 1_000)];
  const next = applyLateFarSpeakerName(lines, { segmentId: id.toLowerCase(), speakerName: "  Minh Tran " });
  assert.equal(next[0].speakerName, "Minh Tran");
  assert.equal(next[0].segmentId, id);
});

test("lateFarSpeakerNameFor is the same rule, one line at a time", () => {
  assert.equal(lateFarSpeakerNameFor(line("a", NOBODY, 0), "Minh"), "Minh");
  assert.equal(lateFarSpeakerNameFor(line("a", "Lan", 0), "Minh"), null);
  assert.equal(lateFarSpeakerNameFor(line("a", NOBODY, 0, { speakerId: HOST }), "Minh"), null);
  assert.equal(lateFarSpeakerNameFor(line("a", NOBODY, 0), NOBODY), null);
});

test("a revision of a named Meet line does not take it back to nobody", () => {
  const named = line("a", "Minh Tran", 1_000);
  assert.equal(revisedFarSideSpeakerName(named, line("a", NOBODY, 1_000)), "Minh Tran");
  // A revision carrying a real name of its own is the newer answer.
  assert.equal(revisedFarSideSpeakerName(named, line("a", "Lan Nguyen", 1_000)), "Lan Nguyen");
  // Still nobody on both sides: unchanged.
  assert.equal(revisedFarSideSpeakerName(line("a", NOBODY, 0), line("a", NOBODY, 0)), NOBODY);
  // Not a stand-in line: the incoming name, always — the roster rule is somebody else's.
  const host = line("a", "Huynh Thai Tu", 0, { speakerId: HOST });
  assert.equal(revisedFarSideSpeakerName(host, line("a", "", 0, { speakerId: HOST })), "");
});

// ── regrouping ───────────────────────────────────────────────────────────────────────────────────

test("a renamed line leaves the unnamed run and joins its speaker's turn, drawn once", () => {
  // The case this exists for: Minh starts talking, his first line goes out unnamed because the
  // captions naming him arrive a second later; his next line is named on arrival.
  const before = [
    line("a", "Lan Nguyen", 1_000),
    line("b", NOBODY, 2_100),
    line("c", "Minh Tran", 3_200),
  ];
  assert.deepEqual(
    groupTranscriptSegments(before).map((group) => [group.speakerName, group.mergedSegmentIds]),
    [["Lan Nguyen", ["a"]], [NOBODY, ["b"]], ["Minh Tran", ["c"]]],
  );

  const after = groupTranscriptSegments(applyLateFarSpeakerName(before, { segmentId: "b", speakerName: "Minh Tran" }));
  assert.deepEqual(
    after.map((group) => [group.speakerName, group.mergedSegmentIds]),
    [["Lan Nguyen", ["a"]], ["Minh Tran", ["b", "c"]]],
  );
  // Every segment is in exactly one bubble, and the bubble keys (first segment id) are unique.
  const all = after.flatMap((group) => group.mergedSegmentIds);
  assert.deepEqual(all, ["a", "b", "c"]);
  assert.equal(new Set(after.map((group) => group.segmentId)).size, after.length);
});

test("renaming the first of an unnamed run splits it without losing or doubling a line", () => {
  const before = [line("a", NOBODY, 1_000), line("b", NOBODY, 2_100)];
  assert.equal(groupTranscriptSegments(before).length, 1);

  const after = groupTranscriptSegments(applyLateFarSpeakerName(before, { segmentId: "a", speakerName: "Lan Nguyen" }));
  assert.deepEqual(
    after.map((group) => [group.speakerName, group.mergedSegmentIds]),
    [["Lan Nguyen", ["a"]], [NOBODY, ["b"]]],
  );
});

test("translations stay with the renamed line through the regroup", () => {
  const before = [
    line("b", NOBODY, 2_100, { translations: { vi: "câu một" } }),
    line("c", "Minh Tran", 3_200, { translations: { vi: "câu hai" } }),
  ];
  const [group] = groupTranscriptSegments(applyLateFarSpeakerName(before, { segmentId: "b", speakerName: "Minh Tran" }));
  assert.equal(group.translations?.vi, "câu một câu hai");
});

// ── the live store ───────────────────────────────────────────────────────────────────────────────

const store = () => useTranslationRoomStore.getState();

beforeEach(() => {
  store().reset();
});

test("the store names the line in both lanes, and a repeat or an unknown id re-renders nothing", () => {
  store().addTranscriptSegment(line("a", NOBODY, 1_000));
  store().nameTranscriptSegmentSpeaker({ segmentId: "a", speakerName: "Minh Tran" });

  assert.equal(store().transcriptSegments[0].speakerName, "Minh Tran");
  assert.equal(store().captionSegments[0].speakerName, "Minh Tran");

  const transcript = store().transcriptSegments;
  const captions = store().captionSegments;
  store().nameTranscriptSegmentSpeaker({ segmentId: "a", speakerName: "Minh Tran" });
  store().nameTranscriptSegmentSpeaker({ segmentId: "unknown", speakerName: "Minh Tran" });
  assert.equal(store().transcriptSegments, transcript);
  assert.equal(store().captionSegments, captions);
});

test("the store names a caption-only line (said while the transcript was paused) in its lane only", () => {
  store().setTranscriptPaused(true);
  store().addTranscriptSegment(line("a", NOBODY, 1_000));
  store().nameTranscriptSegmentSpeaker({ segmentId: "a", speakerName: "Minh Tran" });

  assert.equal(store().captionSegments[0].speakerName, "Minh Tran");
  assert.equal(store().transcriptSegments.length, 0, "the rename must not put paused speech in the transcript");
});

test("a later revision of the same segment keeps the late name and its translations", () => {
  store().addTranscriptSegment(line("a", NOBODY, 1_000));
  const translation: TranslationTextDto = {
    segmentId: "a-vi-c0",
    sourceSegmentId: "a",
    speakerId: STAND_IN,
    originalText: "said a",
    translatedText: "đã nói a",
    sourceLang: "en",
    targetLang: "vi",
    chunkIndex: 0,
  };
  store().addOrMergeTranslationText(translation);
  store().nameTranscriptSegmentSpeaker({ segmentId: "a", speakerName: "Minh Tran" });
  // A redelivery of the original broadcast, still carrying the fallback.
  store().addTranscriptSegment(line("a", NOBODY, 1_000, { originalText: "said a, revised" }));

  const [only] = store().transcriptSegments;
  assert.equal(store().transcriptSegments.length, 1);
  assert.equal(only.speakerName, "Minh Tran");
  assert.equal(only.originalText, "said a, revised");
  assert.equal(only.translations?.vi, "đã nói a");
});

test("a line that arrived named keeps its name when a late event names someone else", () => {
  store().addTranscriptSegment(line("a", "Lan Nguyen", 1_000));
  store().nameTranscriptSegmentSpeaker({ segmentId: "a", speakerName: "Minh Tran" });
  assert.equal(store().transcriptSegments[0].speakerName, "Lan Nguyen");
});

// ── the saved-row backstop ───────────────────────────────────────────────────────────────────────

function saved(id: string, speakerName: string, sequenceOrder: number): SavedTranscriptSegmentDto {
  return {
    id,
    speakerParticipantId: STAND_IN,
    speakerName,
    originalText: `said ${id}`,
    originalLanguage: "en",
    startTimeMs: sequenceOrder * 1_000,
    endTimeMs: sequenceOrder * 1_000 + 800,
    sequenceOrder,
  };
}

test("a client that missed the event still names the line once the saved row has the name", () => {
  const live = [line("b", NOBODY, 2_000), line("c", "Lan Nguyen", 3_000)];
  const result = buildCatchUpTranscript(
    [saved("a", "Lan Nguyen", 1), saved("b", "Minh Tran", 2), saved("c", "Someone Else", 3)],
    live,
  );
  assert.deepEqual(
    result.segments.map((segment) => [segment.segmentId, segment.speakerName]),
    [["a", "Lan Nguyen"], ["b", "Minh Tran"], ["c", "Lan Nguyen"]],
  );
  // The live copy otherwise still wins: the line that was named on arrival kept its own name, and
  // a line with nothing to adopt is the same object.
  assert.equal(result.segments[2], live[1]);
});

test("a saved row that still says nobody leaves the live line as it is", () => {
  const live = [line("b", NOBODY, 2_000)];
  const result = buildCatchUpTranscript([saved("b", NOBODY, 2)], live);
  assert.equal(result.segments[0], live[0]);
});
