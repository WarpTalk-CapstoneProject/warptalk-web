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

test("listen is not guessed from the locale", () => {
  // Speaking Vietnamese does not mean wanting to hear Vietnamese — defaulting both to the
  // locale would silently turn translation off.
  const suggestion = suggestLanguageProfile({
    locales: ["vi-VN"],
    roomListen: "en",
    available,
  });
  assert.equal(suggestion.speak, "vi");
  assert.equal(suggestion.listen, "en");
});

test("with nothing to hear specified, listen differs from speak", () => {
  const suggestion = suggestLanguageProfile({ locales: ["vi"], available: ["vi", "en"] });
  assert.equal(suggestion.speak, "vi");
  assert.notEqual(suggestion.listen, "vi");
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
