/**
 * WT-873 — the live caption lane shows the current caption only, and names a speaker once per
 * run rather than on every line. See live-caption-lines.ts.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LIVE_CAPTION_VISIBLE_LINES,
  liveCaptionLines,
  type LiveCaptionLine,
} from "../live-caption-lines.ts";

type Line = { id: string; speaker: string | null };
const line = (id: string, speaker: string | null): Line => ({ id, speaker });
const speakerOf = (l: Line) => l.speaker;
const shape = (rows: LiveCaptionLine<Line>[]) =>
  rows.map((row) => `${row.line.id}:${row.showSpeaker ? "S" : "-"}`);

test("the lane never renders history: only the newest lines, however long the meeting", () => {
  const meeting = Array.from({ length: 400 }, (_, i) => line(`s${i}`, i % 2 ? "a" : "b"));
  const rows = liveCaptionLines(meeting, speakerOf);
  assert.equal(rows.length, LIVE_CAPTION_VISIBLE_LINES);
  assert.deepEqual(
    rows.map((row) => row.line.id),
    ["s398", "s399"],
  );
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
  const rows = liveCaptionLines([line("1", "a"), line("2", "a"), line("3", "a")], speakerOf);
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
