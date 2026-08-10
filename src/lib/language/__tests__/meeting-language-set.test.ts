/**
 * The meeting-language set, compared the way the server stores it.
 *
 * The picker offers locale tags ("vi-VN"); the server saves bare codes, because
 * LanguageHelper.NormalizeLanguageCode splits on the dash first. Comparing the raw strings
 * meant an already-picked language read as unpicked, so clicking it appended another copy —
 * and production ended up holding ["en","vi","vi","vi","vi","vi"] for one room.
 *
 * These pin the rule the selector now follows. They live here rather than beside the
 * component because the component is TSX, which the node test runner cannot parse.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { normalizeLanguage } from "../language-profile.ts";
import { meetingLanguageSet } from "../languages.ts";

/** Mirrors the selector: same language once, first spelling wins. */
function dedupe(languages: string[]): string[] {
  return languages.reduce<string[]>((unique, code) => {
    const bare = normalizeLanguage(code);
    return bare && !unique.some((item) => normalizeLanguage(item) === bare)
      ? [...unique, code]
      : unique;
  }, []);
}

function isPicked(selected: string[], code: string): boolean {
  const bare = normalizeLanguage(code);
  return selected.some((item) => normalizeLanguage(item) === bare);
}

test("a locale tag matches the bare code the server saved", () => {
  // The whole bug in one line: this was false, so the row looked unpicked.
  assert.equal(isPicked(["en", "vi"], "vi-VN"), true);
  assert.equal(isPicked(["en", "vi"], "en-US"), true);
  assert.equal(isPicked(["en", "vi"], "ja-JP"), false);
});

test("a room already carrying duplicates shows one flag per language", () => {
  // Exactly what production held for the room in the report.
  assert.deepEqual(dedupe(["en", "vi", "vi", "vi", "vi", "vi"]), ["en", "vi"]);
});

test("duplicates that differ only by locale tag are still duplicates", () => {
  assert.deepEqual(dedupe(["en", "vi", "vi-VN", "en-US"]), ["en", "vi"]);
});

test("a clean set is left exactly as it is", () => {
  assert.deepEqual(dedupe(["en", "vi", "ja"]), ["en", "vi", "ja"]);
});

test("empty and malformed entries do not become a language", () => {
  assert.deepEqual(dedupe(["en", "", "   ", "vi"]), ["en", "vi"]);
});

// ── What the meetings list and the calendar block show ──────────────────────────────

/**
 * These exercise the REAL exported function, not a copy of its rule. The rule had already been
 * hand-written twice — once in the list chip, once in the calendar block — and the two had
 * drifted into punctuating the same room differently ("→" versus ";").
 */

test("the source is not repeated among the languages it is already in", () => {
  // The row read "English → English · Vietnamese" because the filter that removed the source
  // compared RAW strings, and the room stored "en" beside "en-US".
  assert.deepEqual(meetingLanguageSet("en-US", ["en", "vi"]), ["en-US", "vi"]);
});

test("a monolingual meeting names one language", () => {
  assert.deepEqual(meetingLanguageSet("vi", ["vi"]), ["vi"]);
  assert.deepEqual(meetingLanguageSet("vi", []), ["vi"]);
});

test("the whole declared set survives, in the order it was declared", () => {
  assert.deepEqual(meetingLanguageSet("en", ["vi", "ja"]), ["en", "vi", "ja"]);
});

test("a room with no source still shows its targets", () => {
  assert.deepEqual(meetingLanguageSet(undefined, ["vi", "en"]), ["vi", "en"]);
  assert.deepEqual(meetingLanguageSet(null, ["vi"]), ["vi"]);
});

test("a room with nothing declared shows nothing rather than inventing English", () => {
  // The chip used to fall back to "en-US" when sourceLanguage was absent, so a room with no
  // languages at all still flew an American flag.
  assert.deepEqual(meetingLanguageSet(undefined, undefined), []);
  assert.deepEqual(meetingLanguageSet("", []), []);
});

test("empty and malformed entries never become a flag", () => {
  assert.deepEqual(meetingLanguageSet("en", ["", "   ", "vi"]), ["en", "vi"]);
});
