import assert from "node:assert/strict";
import test from "node:test";
import {
  SUPPORTED_LANGUAGES,
  formatLanguageRoute,
  formatLanguageRouteShort,
  getLanguageCode,
  getLanguageName,
  isLanguageAllowedByPolicy,
  languagesInScope,
  meetingLanguagesForPolicy,
  normalizeLanguageCode,
  normalizeLanguagePolicy,
  reconcileMeetingLanguages,
} from "../languages.ts";

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

  // Every meeting language, since the catalogue is warmed for every language Cartesia publishes.
  // It used to be ["vi", "en"]: the catalogue only existed for a language after a meeting had
  // dubbed into it, and this scope was drawn around that limitation. A workspace's policy narrows
  // it — see voice/library-languages.ts — so this is the ceiling, not what a person is offered.
  assert.deepEqual(
    languagesInScope("voiceCatalog").map((language) => language.code),
    ["vi", "en", "ja", "ko", "fr", "es"],
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

test("the short route reads as codes, with the source not repeated", () => {
  // The calendar's Agenda row: "EN → VI", never "English → Vietnamese" in a 12px meta line.
  assert.equal(formatLanguageRouteShort("en-US", ["en-US", "vi-VN"]), "EN → VI");
  assert.equal(formatLanguageRouteShort("vi-VN", ["vi-VN", "en-US", "ja-JP"]), "VI → EN, JA");
  // Deduped on the language, not the tag — the same rule the long form applies.
  assert.equal(formatLanguageRouteShort("en", ["en-GB", "vi"]), "EN → VI");
  assert.equal(formatLanguageRouteShort("vi-VN", ["vi-VN"]), "VI");
});

test("the short route never opens on a bare arrow", () => {
  assert.equal(formatLanguageRouteShort(undefined, ["vi-VN"]), "Auto → VI");
  assert.equal(formatLanguageRouteShort(undefined, []), "Auto");
});

test("an empty workspace policy means unrestricted, not forbidden", () => {
  // The load-bearing rule of WT-271. The server disables its whitelist check entirely when
  // the stored list is empty (WorkspaceGrpcService.cs:151); reading empty as "nothing
  // allowed" here would leave every workspace that never set a policy unable to pick a
  // language at all.
  for (const policy of [[], undefined, null]) {
    assert.deepEqual(
      meetingLanguagesForPolicy(policy).map((language) => language.code),
      ["vi", "en", "ja", "ko", "fr", "es"],
    );
    assert.equal(isLanguageAllowedByPolicy("ko", policy), true);
    assert.equal(isLanguageAllowedByPolicy("ko-KR", policy), true);
  }

  // A list of nothing but blanks is still an empty policy, not a policy of one blank code.
  assert.equal(normalizeLanguagePolicy(["", "   "]).length, 0);
  assert.equal(isLanguageAllowedByPolicy("ko", ["", "   "]), true);
});

test("a non-empty workspace policy is a whitelist", () => {
  // The production case: policy ["en","vi","ja"], and the picker offered ko/fr/es anyway.
  const policy = ["en", "vi", "ja"];
  assert.deepEqual(
    meetingLanguagesForPolicy(policy).map((language) => language.code),
    ["vi", "en", "ja"],
  );
  assert.equal(isLanguageAllowedByPolicy("ko", policy), false);
  assert.equal(isLanguageAllowedByPolicy("fr", policy), false);
  assert.equal(isLanguageAllowedByPolicy("es", policy), false);
});

test("the policy is compared on bare codes however either side spells them", () => {
  // The picker's option values are locale tags while the workspace setting stores bare
  // codes; comparing the raw strings is how a whitelist matches nothing at all.
  assert.equal(isLanguageAllowedByPolicy("vi-VN", ["vi"]), true);
  assert.equal(isLanguageAllowedByPolicy("en-US", ["en", "vi"]), true);
  assert.equal(isLanguageAllowedByPolicy("ko-KR", ["en", "vi"]), false);
  assert.deepEqual(normalizeLanguagePolicy(["EN", "vi-VN", "en"]), ["en", "vi"]);
});

test("a picked set is trimmed to the policy, never emptied", () => {
  // At least one language must stay selected, so a default pair the policy forbids outright
  // falls back to the first language it does permit rather than to nothing.
  assert.deepEqual(reconcileMeetingLanguages(["en-US", "vi-VN"], ["en", "vi", "ja"]), [
    "en-US",
    "vi-VN",
  ]);
  assert.deepEqual(reconcileMeetingLanguages(["en-US", "ko-KR"], ["en"]), ["en-US"]);
  assert.deepEqual(reconcileMeetingLanguages(["en-US", "vi-VN"], ["ja"]), ["ja-JP"]);

  // Empty policy leaves the selection exactly as it was.
  assert.deepEqual(reconcileMeetingLanguages(["en-US", "ko-KR"], []), ["en-US", "ko-KR"]);

  // A policy naming only non-meeting languages permits nothing to fall back to; returning
  // an empty set lets the dialog's own validation block submit rather than sending a set
  // the server would refuse.
  assert.deepEqual(reconcileMeetingLanguages(["en-US"], ["zh"]), []);
});

test("an unknown language is passed through rather than guessed at", () => {
  // Nothing better to show than what we were given — there is no full name on file for it.
  assert.equal(getLanguageName("kl-GL"), "kl-GL");
  assert.equal(getLanguageName(undefined), "Auto");
  assert.equal(getLanguageName(""), "Auto");
});

/**
 * WT-661: the short mark beside a language is its ISO-639-1 code, not a flag emoji.
 *
 * Two independent defects retired the flag. Windows ships no colour flag glyphs, so a
 * regional-indicator pair rendered as its two letters and a room configured for English and
 * Vietnamese read "US · VN". And a flag asserted a country: English was drawn as the United
 * States, which is wrong for every British, Indian, Nigerian and Australian speaker of it.
 */
test("a language's short mark is its own code, from a tag or a bare code", () => {
  assert.equal(getLanguageCode("vi-VN"), "VI");
  assert.equal(getLanguageCode("en-US"), "EN");
  assert.equal(getLanguageCode("ja-JP"), "JA");
  assert.equal(getLanguageCode("vi"), "VI");
  assert.equal(getLanguageCode("vi_VN"), "VI");
});

test("an unknown language degrades to its own tag, not to nothing", () => {
  // The flag did the opposite: no region meant no glyph, so the badge vanished for any language
  // the registry had not been taught. A code is available for every tag there is.
  assert.equal(getLanguageCode("xh"), "XH");
  assert.equal(getLanguageCode("kl-GL"), "KL");
});

test("no language means no mark", () => {
  assert.equal(getLanguageCode(undefined), "");
  assert.equal(getLanguageCode(""), "");
});

test("the code never carries a region, which is the whole point", () => {
  // en-US and en-GB are one language and must produce one mark. The flag produced two, and
  // neither of them said "English".
  assert.equal(getLanguageCode("en-GB"), getLanguageCode("en-US"));
});
