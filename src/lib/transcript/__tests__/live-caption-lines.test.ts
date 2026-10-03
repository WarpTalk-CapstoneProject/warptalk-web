/**
 * The live caption lane keeps a bounded, scrollable history (4 Oct 2026, reversing WT-873's
 * two-line cut), names a speaker once per run, and shows live text only in the reader's own
 * language. See live-caption-lines.ts.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LIVE_CAPTION_COLLAPSED_LINES,
  LIVE_CAPTION_HISTORY_LINES,
  isLiveTextForReader,
  liveCaptionLines,
  type LiveCaptionLine,
} from "../live-caption-lines.ts";

type Line = { id: string; speaker: string | null };
const line = (id: string, speaker: string | null): Line => ({ id, speaker });
const speakerOf = (l: Line) => l.speaker;
const shape = (rows: LiveCaptionLine<Line>[]) =>
  rows.map((row) => `${row.line.id}:${row.showSpeaker ? "S" : "-"}`);

test("the open lane keeps history to scroll back through, bounded however long the meeting", () => {
  const meeting = Array.from({ length: 400 }, (_, i) => line(`s${i}`, i % 2 ? "a" : "b"));
  const rows = liveCaptionLines(meeting, speakerOf);
  assert.equal(rows.length, LIVE_CAPTION_HISTORY_LINES);
  assert.equal(rows.at(-1)?.line.id, "s399");
  assert.ok(LIVE_CAPTION_HISTORY_LINES > 2, "more than the old two-line subtitle");
});

test("the collapsed lane is the line being spoken and nothing else", () => {
  const rows = liveCaptionLines(
    [line("1", "a"), line("2", "b")],
    speakerOf,
    LIVE_CAPTION_COLLAPSED_LINES,
  );
  assert.deepEqual(shape(rows), ["2:S"]);
});

test("live text shows only when the speaker talks the reader's language", () => {
  assert.equal(isLiveTextForReader("vi", "vi-VN"), true);
  assert.equal(isLiveTextForReader("en-US", "en"), true);
  assert.equal(isLiveTextForReader("ja", "en"), false, "a foreign half-sentence the translation replaces");
  assert.equal(isLiveTextForReader("vi", null), true, "an unresolved reader is not shown a blank lane");
});

test("a speaker talking on is named once, not on every line", () => {
  const rows = liveCaptionLines([line("1", "a"), line("2", "a"), line("3", "a")], speakerOf, 3);
  assert.deepEqual(shape(rows), ["1:S", "2:-", "3:-"]);
});

test("the speaker is named again when the speaker changes", () => {
  const rows = liveCaptionLines(
    [line("1", "a"), line("2", "b"), line("3", "b"), line("4", "a")],
    speakerOf,
    4,
  );
  assert.deepEqual(shape(rows), ["1:S", "2:S", "3:-", "4:S"]);
});

test("the first line on screen always names its speaker, even mid-run", () => {
  const rows = liveCaptionLines([line("1", "a"), line("2", "a"), line("3", "a")], speakerOf, 2);
  assert.deepEqual(shape(rows), ["2:S", "3:-"]);
});

test("speaker ids compare case-insensitively", () => {
  const rows = liveCaptionLines(
    [line("1", "0198ABCD-EF"), line("2", "0198abcd-ef")],
    speakerOf,
  );
  assert.deepEqual(shape(rows), ["1:S", "2:-"]);
});

test("empty input and a zero limit render nothing", () => {
  assert.deepEqual(liveCaptionLines([], speakerOf), []);
  assert.deepEqual(liveCaptionLines([line("1", "a")], speakerOf, 0), []);
});
