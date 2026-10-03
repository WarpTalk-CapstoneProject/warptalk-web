/**
 * Live text, 4 Oct 2026: the words of a turn still being spoken, one line per speaker, replaced by
 * the speaker's final line. See ../live-text.ts.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clearLiveLine,
  expireLiveLine,
  orderedLiveLines,
  upsertLiveLine,
  type LiveLines,
} from "../live-text.ts";

const ky = { speakerId: "ky", speakerName: "Kỳ", itemId: "item-1", language: "vi" };

test("a newer update replaces the speaker's line rather than adding one", () => {
  let lines: LiveLines = {};
  lines = upsertLiveLine(lines, { ...ky, text: "Mọi người" }, 1);
  lines = upsertLiveLine(lines, { ...ky, text: "Mọi người có câu hỏi" }, 2);

  assert.deepEqual(orderedLiveLines(lines).map((line) => line.text), ["Mọi người có câu hỏi"]);
});

test("an unchanged update is not a new state", () => {
  const lines = upsertLiveLine({}, { ...ky, text: "Ừ" }, 1);
  assert.equal(upsertLiveLine(lines, { ...ky, text: " Ừ " }, 5), lines);
});

test("an empty update or a missing speaker is ignored", () => {
  assert.deepEqual(upsertLiveLine({}, { ...ky, text: "   " }, 1), {});
  assert.deepEqual(upsertLiveLine({}, { ...ky, speakerId: "", text: "x" }, 1), {});
});

test("the speaker's final line clears their live line and nobody else's", () => {
  let lines = upsertLiveLine({}, { ...ky, text: "Ừ" }, 1);
  lines = upsertLiveLine(lines, { ...ky, speakerId: "tuan", speakerName: "Tuấn", text: "Okay" }, 2);

  const after = clearLiveLine(lines, "ky");
  assert.deepEqual(Object.keys(after), ["tuan"]);
  assert.equal(clearLiveLine(after, "ky"), after);
});

test("a scheduled expiry drops only the update it was scheduled for", () => {
  let lines = upsertLiveLine({}, { ...ky, text: "Mọi" }, 1);
  lines = upsertLiveLine(lines, { ...ky, text: "Mọi người" }, 2);

  assert.equal(expireLiveLine(lines, "ky", 1), lines, "a newer update keeps the line alive");
  assert.deepEqual(expireLiveLine(lines, "ky", 2), {});
});

test("lines are shown oldest first", () => {
  let lines = upsertLiveLine({}, { ...ky, speakerId: "b", text: "second" }, 20);
  lines = upsertLiveLine(lines, { ...ky, speakerId: "a", text: "first" }, 10);

  assert.deepEqual(orderedLiveLines(lines).map((line) => line.text), ["first", "second"]);
});
