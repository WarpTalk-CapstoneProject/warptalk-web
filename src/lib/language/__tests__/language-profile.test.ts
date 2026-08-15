import test from "node:test";
import assert from "node:assert/strict";

import {
  mostChosen,
  normalizeLanguage,
  shouldAskForLanguages,
  suggestLanguageProfile,
} from "../language-profile.ts";

const available = ["en", "vi", "ja"];

test("a remembered answer is never asked for again", () => {
  // The complaint that started this: the same person answered the same question on every
  // join, and their answer was thrown away when they left.
  assert.equal(
    shouldAskForLanguages({ settingsSpeak: "vi", settingsListen: "en" }),
    false,
  );
});

test("a half-remembered answer still asks", () => {
  assert.equal(shouldAskForLanguages({ settingsSpeak: "vi", settingsListen: null }), true);
  assert.equal(shouldAskForLanguages({ settingsSpeak: "  ", settingsListen: "en" }), true);
  assert.equal(shouldAskForLanguages({}), true);
});

test("the user's own setting outranks everything else", () => {
  const suggestion = suggestLanguageProfile({
    settingsSpeak: "ja",
    settingsListen: "en",
    historySpeak: ["vi", "vi", "vi"],
    locales: ["vi-VN"],
    roomSpeak: "en",
    available,
  });
  assert.deepEqual(suggestion, { speak: "ja", listen: "en", source: "settings" });
});

test("with no setting, what they usually pick wins over the browser's guess", () => {
  const suggestion = suggestLanguageProfile({
    historySpeak: ["vi", "vi", "en"],
    locales: ["en-US"],
    available,
  });
  assert.equal(suggestion.speak, "vi");
  assert.equal(suggestion.source, "history");
});

test("with no history, the browser's locale is used", () => {
  const suggestion = suggestLanguageProfile({ locales: ["vi-VN", "en"], available });
  assert.equal(suggestion.speak, "vi");
  assert.equal(suggestion.source, "locale");
});

test("regional variants are the same language to a picker", () => {
  assert.equal(normalizeLanguage("vi-VN"), "vi");
  assert.equal(normalizeLanguage("EN_us"), "en");
  assert.equal(normalizeLanguage("  "), null);
  assert.equal(normalizeLanguage(undefined), null);
});

test("a suggestion the room does not offer is not made", () => {
  // Suggesting a language that is not in the dropdown is worse than suggesting nothing.
  const suggestion = suggestLanguageProfile({
    settingsSpeak: "ko",
    locales: ["ko-KR"],
    roomSpeak: "en",
    available,
  });
  assert.equal(suggestion.speak, "en");
  assert.equal(suggestion.source, "room");
});

test("the room's listen default does not split a suggestion", () => {
  // The old rule preferred `roomListen` over the person's own language, so a Vietnamese speaker
  // joining an en/vi room was silently put on speak=vi / hear=en. That is a pair they never
  // chose, and — once one-language-per-person shipped — one no picker can any longer express.
  // The room's default is a property of the room, not of this person.
  const suggestion = suggestLanguageProfile({
    locales: ["vi-VN"],
    roomListen: "en",
    available,
  });
  assert.equal(suggestion.speak, "vi");
  assert.equal(suggestion.listen, "vi");
});

test("with nothing said about hearing, listen follows speak", () => {
  const suggestion = suggestLanguageProfile({ locales: ["vi"], available: ["vi", "en"] });
  assert.equal(suggestion.speak, "vi");
  assert.equal(suggestion.listen, "vi");
});

test("a listen language the user confirmed themselves still survives", () => {
  // The escape hatch that remains: somebody who speaks Vietnamese but follows English better
  // has that on file in their own account settings, and a suggestion must not overwrite it.
  const suggestion = suggestLanguageProfile({
    settingsSpeak: "vi",
    settingsListen: "en",
    available,
  });
  assert.equal(suggestion.speak, "vi");
  assert.equal(suggestion.listen, "en");
});

test("most chosen breaks ties by recency", () => {
  // "vi" and "en" appear twice each; vi was used most recently.
  assert.equal(mostChosen(["vi", "en", "vi", "en"]), "vi");
  assert.equal(mostChosen([]), null);
  assert.equal(mostChosen(["", "  "]), null);
});

test("no signals at all still produces something usable", () => {
  const suggestion = suggestLanguageProfile({ available: [] });
  assert.equal(suggestion.speak, "en");
  assert.equal(typeof suggestion.listen, "string");
});
