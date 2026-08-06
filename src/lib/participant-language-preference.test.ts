import assert from "node:assert/strict";
import test from "node:test";
import {
  UNRESOLVED_LANGUAGE,
  isResolvedSpeakLanguage,
  normalizeLanguageCode,
  resolveListenLanguage,
  resolveRoomDefaultListenLanguage,
  resolveSpeakLanguage,
} from "./participant-language-preference.ts";

/**
 * The room from the bug report, created through create-room-dialog with languages [en, vi].
 * WT-297: targetLanguages includes the source, so the room's default listen language is "vi"
 * for every participant — which is exactly what used to override the reporter's "en".
 */
const REPORTED_ROOM = {
  sourceLanguage: "en",
  targetLanguages: ["en", "vi"],
};

// ── The precedence chain ────────────────────────────────────────────────

test("server participant record wins over the room default when session storage is empty", () => {
  assert.equal(
    resolveListenLanguage({ participant: "en" }, REPORTED_ROOM),
    "en",
  );
  assert.equal(
    resolveSpeakLanguage({ participant: "vi" }, REPORTED_ROOM),
    "vi",
  );
});

test("session storage outranks the server participant record when both are present", () => {
  assert.equal(
    resolveListenLanguage({ saved: "ja", participant: "en" }, REPORTED_ROOM),
    "ja",
  );
  assert.equal(
    resolveSpeakLanguage({ saved: "ko", participant: "vi" }, REPORTED_ROOM),
    "ko",
  );
});

test("an in-session pick outranks both stored sources", () => {
  assert.equal(
    resolveListenLanguage(
      { pick: "fr", saved: "ja", participant: "en" },
      REPORTED_ROOM,
    ),
    "fr",
  );
  assert.equal(
    resolveSpeakLanguage(
      { pick: "fr", saved: "ko", participant: "vi" },
      REPORTED_ROOM,
    ),
    "fr",
  );
});

test("the room default applies only when no source names a language", () => {
  assert.equal(resolveListenLanguage({}, REPORTED_ROOM), "vi");
  assert.equal(resolveSpeakLanguage({}, REPORTED_ROOM), "en");
});

test("the reported defect: a room default never overrides an explicit choice", () => {
  // speak=vi / listen=en against a [en, vi] room. Before the fix the client resolved
  // listen to the room default "vi" and speak to "auto", producing the inverted "en → vi"
  // label and no dub. Every source of the user's own choice must now beat the default.
  for (const sources of [
    { saved: "en" },
    { participant: "en" },
    { pick: "en" },
  ]) {
    assert.equal(
      resolveListenLanguage(sources, REPORTED_ROOM),
      "en",
      `room default overrode an explicit listen choice from ${Object.keys(sources)[0]}`,
    );
  }
});

test("falls back to English when neither a choice nor a room is known", () => {
  assert.equal(resolveListenLanguage({}, null), "en");
  assert.equal(resolveListenLanguage({}, { targetLanguages: [] }), "en");
});

// ── "auto" is a fallback, never a choice ────────────────────────────────

test('"auto" stored anywhere falls through instead of terminating the chain', () => {
  // The language picker modal and the media bar both offer real codes only, so an "auto"
  // in session storage or on the participant row is a stale default, not a decision.
  assert.equal(
    resolveSpeakLanguage(
      { saved: UNRESOLVED_LANGUAGE, participant: "vi" },
      REPORTED_ROOM,
    ),
    "vi",
  );
  assert.equal(
    resolveSpeakLanguage(
      { participant: UNRESOLVED_LANGUAGE },
      { sourceLanguage: "vi" },
    ),
    "vi",
  );
  assert.equal(
    resolveListenLanguage({ saved: UNRESOLVED_LANGUAGE }, REPORTED_ROOM),
    "vi",
  );
});

test('a resolved speak language is never the literal "auto"', () => {
  // Anything the join call / SetSpeakLanguage may send must be a real language, so the
  // gateway never writes "auto" into translationRoom:{id}:speak_languages and
  // _language_hint_for_stt never degrades to None.
  const resolvable = [
    { sources: { pick: "vi" }, room: REPORTED_ROOM },
    { sources: { saved: "vi-VN" }, room: REPORTED_ROOM },
    { sources: { participant: "vi" }, room: REPORTED_ROOM },
    { sources: {}, room: REPORTED_ROOM },
    { sources: { saved: UNRESOLVED_LANGUAGE }, room: REPORTED_ROOM },
  ];
  for (const { sources, room } of resolvable) {
    const speak = resolveSpeakLanguage(sources, room);
    assert.notEqual(speak, UNRESOLVED_LANGUAGE);
    assert.equal(isResolvedSpeakLanguage(speak), true);
  }
});

test("speak stays unresolved — and unsendable — while nothing at all is known", () => {
  // The participants query is gated on an established meeting session, so it can still be
  // in flight during the first seconds of a join. Guessing a language here would be the
  // same defect in a new place; the caller withholds the value instead.
  assert.equal(resolveSpeakLanguage({}, null), UNRESOLVED_LANGUAGE);
  assert.equal(isResolvedSpeakLanguage(UNRESOLVED_LANGUAGE), false);
  assert.equal(isResolvedSpeakLanguage(""), false);
  assert.equal(isResolvedSpeakLanguage(undefined), false);
  assert.equal(isResolvedSpeakLanguage("vi"), true);
});

// ── Normalization ───────────────────────────────────────────────────────

test("locale tags fold to the bare code the gateway keys everything by", () => {
  assert.equal(normalizeLanguageCode("vi-VN"), "vi");
  assert.equal(normalizeLanguageCode("en_US"), "en");
  assert.equal(normalizeLanguageCode("  JA  "), "ja");
  assert.equal(normalizeLanguageCode(""), "");
  assert.equal(normalizeLanguageCode(undefined), "");
  // Resolution normalizes too, so a locale-tagged join config compares equal to the bare
  // code the TranslationTextReceived filter tests targetLang against.
  assert.equal(resolveListenLanguage({ saved: "en-US" }, REPORTED_ROOM), "en");
  assert.equal(resolveSpeakLanguage({ participant: "vi-VN" }, REPORTED_ROOM), "vi");
});

// ── Room default ────────────────────────────────────────────────────────

test("room default listen language prefers a target that is not the room source", () => {
  assert.equal(resolveRoomDefaultListenLanguage(REPORTED_ROOM), "vi");
  assert.equal(
    resolveRoomDefaultListenLanguage({
      sourceLanguage: "vi",
      targetLanguages: ["vi", "en"],
    }),
    "en",
  );
  // A single-language room has no "other" target; the lone target is the only answer.
  assert.equal(
    resolveRoomDefaultListenLanguage({
      sourceLanguage: "en",
      targetLanguages: ["en"],
    }),
    "en",
  );
});
