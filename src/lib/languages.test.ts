import assert from "node:assert/strict";
import test from "node:test";
import { getLanguageName, normalizeLanguageCode } from "./languages.ts";

test("locale tags fold to the bare code the rest of the app is keyed by", () => {
  assert.equal(normalizeLanguageCode("vi-VN"), "vi");
  assert.equal(normalizeLanguageCode("en-US"), "en");
  assert.equal(normalizeLanguageCode("ja_JP"), "ja");
  assert.equal(normalizeLanguageCode("VI-vn"), "vi");
});

test("bare codes and names still resolve", () => {
  assert.equal(normalizeLanguageCode("vi"), "vi");
  assert.equal(normalizeLanguageCode("Vietnamese"), "vi");
  assert.equal(normalizeLanguageCode("english (united states)"), "en");
});

test("a language reads as its full name whatever shape it arrives in", () => {
  // The bug this covers: a locale tag matched no supported language, so getLanguageName fell
  // through to its raw-value fallback and the UI printed "vi-VN" at the user.
  assert.equal(getLanguageName("vi-VN"), "Vietnamese");
  assert.equal(getLanguageName("vi"), "Vietnamese");
  assert.equal(getLanguageName("en-US"), "English");
  assert.equal(getLanguageName("ja-JP"), "Japanese");
});

test("an unknown language is passed through rather than guessed at", () => {
  // Nothing better to show than what we were given — there is no full name on file for it.
  assert.equal(getLanguageName("kl-GL"), "kl-GL");
  assert.equal(getLanguageName(undefined), "Auto");
});
