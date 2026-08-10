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
