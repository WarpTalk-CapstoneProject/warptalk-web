import assert from "node:assert/strict";
import test from "node:test";
import {
  SUPPORTED_LANGUAGES,
  formatLanguageRoute,
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
  assert.deepEqual(meeting, ["vi", "en", "ja"]);

  // Other known languages still render cleanly for stored data and non-meeting surfaces, but
  // they are deliberately not offered when creating/configuring meetings.
  assert.ok(!meeting.includes("zh"));
  assert.ok(!meeting.includes("ko"));
  assert.ok(!meeting.includes("fr"));
  assert.ok(!meeting.includes("es"));
  assert.equal(getLanguageName("zh-CN"), "Chinese");

  assert.deepEqual(
    languagesInScope("voiceCatalog").map((language) => language.code),
    ["vi", "en"],
  );
});

test("a participant may still pick a language a host can no longer declare", () => {
  // `meeting` narrowed to the three project languages; `participantLanguage` did not, and must
  // not. Rooms created while Korean, French and Spanish were meeting languages still exist, and
  // the pre-join picker is how someone joins one in the language it was created for.
  const participant = languagesInScope("participantLanguage").map((l) => l.code);

  for (const code of ["vi", "en", "ja", "ko", "fr", "es"]) {
    assert.ok(
      participant.includes(code),
      `${code} must stay selectable on the pre-join screen`,
    );
  }

  // Never a room language, so never offered to a participant either.
  assert.ok(!participant.includes("zh"));

  // The wider scope is a superset of the narrower one.
  for (const code of languagesInScope("meeting").map((l) => l.code)) {
    assert.ok(participant.includes(code), `${code} is meeting-scope but not joinable`);
  }
});

test("a policy naming a grandfathered language still yields a usable picker", () => {
  // Korean left the meeting scope after workspaces had already pinned policies naming it.
  // Intersecting the two left an EMPTY picker, and an empty picker means that workspace can
  // create no meeting at all. An explicit policy entry is a decision, not a suggestion.
  assert.deepEqual(
    meetingLanguagesForPolicy(["ko"]).map((language) => language.code),
    ["ko"],
  );
  assert.deepEqual(
    meetingLanguagesForPolicy(["ko-KR", "fr"]).map((language) => language.code),
    ["ko", "fr"],
  );

  // Scope languages first, then the grandfathered extras in policy order.
  assert.deepEqual(
    meetingLanguagesForPolicy(["ko", "en"]).map((language) => language.code),
    ["en", "ko"],
  );

  // And the fallback that depends on it now has something to return.
  assert.deepEqual(reconcileMeetingLanguages(["en-US"], ["ko"]), ["ko-KR"]);

  // Chinese has never been a room language, so a policy naming it still permits nothing —
  // widening for grandfathered languages must not widen for one that was never offered.
  assert.deepEqual(meetingLanguagesForPolicy(["zh"]), []);
  assert.deepEqual(meetingLanguagesForPolicy(["kl-KL"]), []);
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

test("an empty workspace policy means unrestricted, not forbidden", () => {
  // The load-bearing rule of WT-271. The server disables its whitelist check entirely when
  // the stored list is empty (WorkspaceGrpcService.cs:151); reading empty as "nothing
  // allowed" here would leave every workspace that never set a policy unable to pick a
  // language at all.
  for (const policy of [[], undefined, null]) {
    assert.deepEqual(
      meetingLanguagesForPolicy(policy).map((language) => language.code),
      ["vi", "en", "ja"],
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
