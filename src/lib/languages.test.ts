import assert from "node:assert/strict";
import test from "node:test";
import {
  SUPPORTED_LANGUAGES,
  formatLanguageRoute,
  getLanguageName,
  languagesInScope,
  normalizeLanguageCode,
} from "./languages.ts";

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
  assert.equal(normalizeLanguageCode("Tiếng Việt"), "vi");
});

test("an absent language normalizes to nothing rather than to English", () => {
  // It used to default to "en", which quietly relabelled an unset language as English.
  assert.equal(normalizeLanguageCode(undefined), "");
  assert.equal(normalizeLanguageCode(""), "");
  assert.equal(normalizeLanguageCode("   "), "");
});

test("a language reads as its full name whatever shape it arrives in", () => {
  // The bug this covers: a locale tag matched no supported language, so getLanguageName fell
  // through to its raw-value fallback and the UI printed "vi-VN" at the user.
  assert.equal(getLanguageName("vi-VN"), "Vietnamese");
  assert.equal(getLanguageName("vi"), "Vietnamese");
  assert.equal(getLanguageName("en-US"), "English");
  assert.equal(getLanguageName("ja-JP"), "Japanese");
});

test("every language in the registry has a name on file, in both shapes", () => {
  // Korean was offerable as a meeting language while missing from the registry entirely, so
  // every surface that named it printed the raw "ko-KR".
  for (const language of SUPPORTED_LANGUAGES) {
    assert.equal(getLanguageName(language.code), language.name);
    assert.equal(getLanguageName(language.locale), language.name);
    assert.notEqual(getLanguageName(language.locale), language.locale);
  }
});

test("Korean specifically resolves, in both shapes", () => {
  assert.equal(getLanguageName("ko"), "Korean");
  assert.equal(getLanguageName("ko-KR"), "Korean");
});

test("scopes decide what a picker offers", () => {
  const meeting = languagesInScope("meeting").map((language) => language.code);
  assert.deepEqual(meeting, ["vi", "en", "ja", "ko", "fr", "es"]);

  // Chinese is known so stored data renders, but is deliberately not a meeting language.
  assert.ok(!meeting.includes("zh"));
  assert.equal(getLanguageName("zh-CN"), "Chinese");

  assert.deepEqual(
    languagesInScope("voiceCatalog").map((language) => language.code),
    ["vi", "en"],
  );
});

test("the language route reads as names, with the source not repeated", () => {
  // A room stores its whole declared set as targetLanguages, source included, so the old
  // formatter printed "EN-US → EN-US, VI-VN".
  assert.equal(formatLanguageRoute("en-US", ["en-US", "vi-VN"]), "English → Vietnamese");
  assert.equal(
    formatLanguageRoute("vi-VN", ["vi-VN", "en-US", "ja-JP"]),
    "Vietnamese → English, Japanese",
  );
});

test("a single-language route is just that language", () => {
  assert.equal(formatLanguageRoute("vi-VN", ["vi-VN"]), "Vietnamese");
  assert.equal(formatLanguageRoute("vi-VN", []), "Vietnamese");
});

test("an unknown language is passed through rather than guessed at", () => {
  // Nothing better to show than what we were given — there is no full name on file for it.
  assert.equal(getLanguageName("kl-GL"), "kl-GL");
  assert.equal(getLanguageName(undefined), "Auto");
  assert.equal(getLanguageName(""), "Auto");
});
