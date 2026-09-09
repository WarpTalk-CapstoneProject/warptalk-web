import assert from "node:assert/strict";
import { test } from "node:test";

import {
  anchorForMs,
  anchorsEqual,
  countMatches,
  groupCitationsByAnchor,
  readingAnchorAt,
  readingShortcut,
  shouldShowLanguageChip,
  speakingShares,
  splitOnQuery,
  stepAnchorKey,
  type LanguageMark,
  type ReadingAnchor,
} from "../document-reading.ts";

/**
 * Every rule in document-reading.ts is right or wrong on a NUMBER, and every one of them is off by
 * one turn in a way that still highlights something and still looks like it works. That is what
 * these are for: "the wrong paragraph lit up" is not a bug anybody files, so it has to be caught
 * before it ships rather than reported after.
 */

/** Three blocks, laid out 0 / 200 / 500 pixels down, covering 0–10s, 10–20s and 30–40s. */
const ANCHORS: ReadingAnchor[] = [
  { key: "a", startMs: 0, endMs: 10_000, offsetTop: 0 },
  { key: "b", startMs: 10_000, endMs: 20_000, offsetTop: 200 },
  { key: "c", startMs: 30_000, endMs: 40_000, offsetTop: 500 },
];

test("the block being read is the last one that starts at or above the reading line", () => {
  assert.equal(readingAnchorAt(ANCHORS, 0)?.key, "a");
  assert.equal(readingAnchorAt(ANCHORS, 199)?.key, "a");
  assert.equal(readingAnchorAt(ANCHORS, 200)?.key, "b");
  assert.equal(readingAnchorAt(ANCHORS, 4_000)?.key, "c");
});

test("a reader above the first block reads the first block, not nothing", () => {
  // Negative because the scroller has padding over the first turn, and a rail that blanked itself
  // for the first few pixels of every meeting would look broken exactly on arrival.
  assert.equal(readingAnchorAt(ANCHORS, -40)?.key, "a");
  assert.equal(readingAnchorAt([], 100), null);
});

test("a cited moment inside a block resolves to that block", () => {
  assert.equal(anchorForMs(ANCHORS, 0)?.key, "a");
  assert.equal(anchorForMs(ANCHORS, 15_000)?.key, "b");
  assert.equal(anchorForMs(ANCHORS, 40_000)?.key, "c");
});

test("a moment in the silence between two blocks belongs to the one already spoken", () => {
  // 25s is after b ends and before c starts. Guessing FORWARDS would send a reader to a paragraph
  // nobody had said yet at the moment the claim is about.
  assert.equal(anchorForMs(ANCHORS, 25_000)?.key, "b");
});

test("a moment before the first recorded word belongs to no block at all", () => {
  assert.equal(anchorForMs(ANCHORS, -1), null);
});

test("claims are filed under the block they came from, gaps included", () => {
  const byAnchor = groupCitationsByAnchor(
    [
      { key: "claim-1", atMs: 5_000 },
      { key: "claim-2", atMs: 25_000 },
      { key: "claim-3", atMs: 12_000 },
      { key: "claim-before", atMs: -500 },
    ],
    ANCHORS,
  );

  assert.deepEqual(byAnchor, {
    a: ["claim-1"],
    b: ["claim-2", "claim-3"],
  });
  // A claim about something that is not in the transcript is not filed anywhere, rather than
  // being filed against the first block and lighting it up for no reason.
  assert.equal(Object.values(byAnchor).flat().includes("claim-before"), false);
});

test("a claim resting on two turns is filed under both of them", () => {
  // This map is read in both directions, and the reverse one is the one that was broken: scrolling
  // to the SECOND turn of a two-turn claim lit nothing, which reads as the summary having run out
  // rather than as a bug.
  const byAnchor = groupCitationsByAnchor(
    [{ key: "exchange", atMs: 5_000, alsoAtMs: [15_000] }],
    ANCHORS,
  );

  assert.deepEqual(byAnchor, { a: ["exchange"], b: ["exchange"] });
});

test("two moments inside one turn are one claim about that turn, not two", () => {
  const byAnchor = groupCitationsByAnchor(
    // 5s and 9s both fall in block a; 25s falls in the silence after b, which belongs to b.
    [{ key: "same-turn", atMs: 5_000, alsoAtMs: [9_000, 5_000, 25_000] }],
    ANCHORS,
  );

  assert.deepEqual(byAnchor, { a: ["same-turn"], b: ["same-turn"] });
});

test("a single-moment claim is filed exactly as it always was", () => {
  // The old shape has no alsoAtMs at all, and an absent field must not be read as a moment.
  assert.deepEqual(
    groupCitationsByAnchor([{ key: "claim-1", atMs: 12_000 }], ANCHORS),
    { b: ["claim-1"] },
  );
  assert.deepEqual(
    groupCitationsByAnchor([{ key: "claim-1", atMs: 12_000, alsoAtMs: [] }], ANCHORS),
    { b: ["claim-1"] },
  );
  // A supporting moment before the first recorded word drops on its own, without taking the
  // primary one with it.
  assert.deepEqual(
    groupCitationsByAnchor([{ key: "claim-1", atMs: 12_000, alsoAtMs: [-500] }], ANCHORS),
    { b: ["claim-1"] },
  );
});

test("a re-measurement of the same document is recognised as the same document", () => {
  assert.equal(anchorsEqual(ANCHORS, ANCHORS.map((anchor) => ({ ...anchor }))), true);
  // A sub-pixel wobble is a font settling, not the document moving.
  assert.equal(
    anchorsEqual(ANCHORS, [{ ...ANCHORS[0], offsetTop: 0.4 }, ANCHORS[1], ANCHORS[2]]),
    true,
  );
  assert.equal(
    anchorsEqual(ANCHORS, [{ ...ANCHORS[0], offsetTop: 12 }, ANCHORS[1], ANCHORS[2]]),
    false,
  );
  assert.equal(anchorsEqual(ANCHORS, ANCHORS.slice(0, 2)), false);
  assert.equal(
    anchorsEqual(ANCHORS, [{ ...ANCHORS[0], key: "renamed" }, ANCHORS[1], ANCHORS[2]]),
    false,
  );
});

test("J and K stop at the ends of the meeting instead of wrapping round", () => {
  assert.equal(stepAnchorKey(ANCHORS, "a", 1), "b");
  assert.equal(stepAnchorKey(ANCHORS, "b", -1), "a");
  assert.equal(stepAnchorKey(ANCHORS, "c", 1), "c");
  assert.equal(stepAnchorKey(ANCHORS, "a", -1), "a");
});

test("the first press moves somewhere even when nothing has been read yet", () => {
  assert.equal(stepAnchorKey(ANCHORS, null, 1), "a");
  assert.equal(stepAnchorKey(ANCHORS, null, -1), "c");
  // A block removed by a correction while the reader was on it is the same case as "nothing".
  assert.equal(stepAnchorKey(ANCHORS, "deleted-turn", 1), "a");
  assert.equal(stepAnchorKey([], "a", 1), null);
});

test("the reading keys are only the reading keys", () => {
  assert.equal(readingShortcut({ key: "j" }, false), "next-turn");
  assert.equal(readingShortcut({ key: "K" }, false), "previous-turn");
  assert.equal(readingShortcut({ key: " " }, false), "toggle-playback");
  assert.equal(readingShortcut({ key: "/" }, false), "open-search");
  assert.equal(readingShortcut({ key: "x" }, false), null);
});

test("a key aimed at a field, a button or the browser is not a reading shortcut", () => {
  // The one that matters: Space on a focused button IS the button, and swallowing it would turn
  // every control in the record into a dead key for anybody working without a mouse.
  assert.equal(readingShortcut({ key: " " }, true), null);
  assert.equal(readingShortcut({ key: "j" }, true), null);
  // Ctrl+J is the browser's download list; Cmd+Space is a system launcher.
  assert.equal(readingShortcut({ key: "j", ctrlKey: true }, false), null);
  assert.equal(readingShortcut({ key: " ", metaKey: true }, false), null);
  assert.equal(readingShortcut({ key: "k", altKey: true }, false), null);
  // Shift is not a modifier here — it is the key resting under somebody's little finger.
  assert.equal(readingShortcut({ key: "J" }, false), "next-turn");
});

const spoken = (language: string): LanguageMark => ({ language, state: "spoken" });

test("a language chip prints when the answer changes, and not on every line", () => {
  assert.equal(shouldShowLanguageChip(spoken("vi"), null), true);
  assert.equal(shouldShowLanguageChip(spoken("vi"), spoken("vi")), false);
  assert.equal(shouldShowLanguageChip(spoken("ja"), spoken("vi")), true);
  // Same language, different claim about it: "spoken in English" and "translated into English"
  // are two different things to tell a reader.
  assert.equal(
    shouldShowLanguageChip({ language: "en", state: "translated" }, spoken("en")),
    true,
  );
});

test("a gap in the translation is repeated, because a repeated gap is still a gap", () => {
  const untranslated: LanguageMark = { language: "ja", state: "untranslated" };
  const partial: LanguageMark = { language: "ja", state: "partial" };
  assert.equal(shouldShowLanguageChip(untranslated, untranslated), true);
  assert.equal(shouldShowLanguageChip(partial, partial), true);
});

test("speaking time is counted per person and ranked loudest first", () => {
  const shares = speakingShares([
    { speakerParticipantId: "u1", speakerName: "Ha", startTimeMs: 0, endTimeMs: 3_000 },
    { speakerParticipantId: "u2", speakerName: "Bao", startTimeMs: 3_000, endTimeMs: 4_000 },
    { speakerParticipantId: "u1", speakerName: "Ha", startTimeMs: 4_000, endTimeMs: 10_000 },
  ]);

  assert.deepEqual(
    shares.map((share) => [share.key, share.speakingMs, share.percent]),
    [
      ["u1", 9_000, 90],
      ["u2", 1_000, 10],
    ],
  );
});

test("a reconnect artefact is discarded rather than counted as the whole meeting", () => {
  // startTimeMs is an offset into the audio ingress track and resets when it reconnects, so a
  // line whose end precedes its start is a measurement that never happened. abs() would hand this
  // speaker four seconds they did not have.
  const shares = speakingShares([
    { speakerParticipantId: "u1", speakerName: "Ha", startTimeMs: 8_000, endTimeMs: 4_000 },
    { speakerParticipantId: "u1", speakerName: "Ha", startTimeMs: 0, endTimeMs: 2_000 },
  ]);

  assert.deepEqual(shares.map((share) => share.speakingMs), [2_000]);
});

test("a name learned late is applied to the speaker counted before it arrived", () => {
  // The ingress worker learns who is on a track after the first chunks are already transcribed.
  const shares = speakingShares([
    { speakerParticipantId: "u1", speakerName: null, startTimeMs: 0, endTimeMs: 1_000 },
    { speakerParticipantId: "u1", speakerName: "Thu Ha", startTimeMs: 1_000, endTimeMs: 2_000 },
  ]);

  assert.deepEqual(shares.map((share) => share.name), ["Thu Ha"]);
});

test("a line nobody can be attributed to is not a speaker", () => {
  assert.deepEqual(
    speakingShares([
      { speakerParticipantId: null, speakerName: null, startTimeMs: 0, endTimeMs: 5_000 },
    ]),
    [],
  );
});

test("find marks the term in place and leaves the sentence around it standing", () => {
  assert.deepEqual(splitOnQuery("the summary is the summary", "summary"), [
    { text: "the ", isMatch: false },
    { text: "summary", isMatch: true },
    { text: " is the ", isMatch: false },
    { text: "summary", isMatch: true },
  ]);
});

test("find is accent-insensitive without moving a single character", () => {
  // The whole reason foldPreservingLength exists: NFD would move every offset after the first
  // accented letter, and the offsets are what put the mark back in the right place.
  const slices = splitOnQuery("Trần Mạnh Tuấn nói", "manh");
  assert.deepEqual(slices, [
    { text: "Trần ", isMatch: false },
    { text: "Mạnh", isMatch: true },
    { text: " Tuấn nói", isMatch: false },
  ]);
  assert.equal(slices.map((slice) => slice.text).join(""), "Trần Mạnh Tuấn nói");
});

test("an empty term marks nothing rather than everything", () => {
  assert.deepEqual(splitOnQuery("anything at all", "   "), [
    { text: "anything at all", isMatch: false },
  ]);
  assert.equal(countMatches("anything at all", ""), 0);
});

test("the match count comes from the same split as the marks, never a second rule", () => {
  assert.equal(countMatches("Đường đường chính chính", "duong"), 2);
});
