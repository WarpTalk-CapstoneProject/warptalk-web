/**
 * The meeting Voice panel's lists, as approved on the review sheet (4 Oct 2026): five library rows
 * at a time, "Show all" inside the same box, a language filter that opens on the language you
 * speak, and saved voices shown by their names with a flag instead of "(vi-VN)".
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ALL_LANGUAGES,
  LIBRARY_VISIBLE_ROWS,
  initialLibraryLanguage,
  libraryVoices,
  libraryWindow,
  profileDisplay,
} from "../voice-panel-library.ts";

const CATALOGS = {
  vi: [
    { id: "v-linh", name: "Linh", gender: "feminine" },
    { id: "v-minh", name: "Minh", gender: "masculine" },
    { id: "v-lien", name: "Lien", gender: "feminine" },
  ],
  en: [
    { id: "e-katie", name: "Katie", gender: "feminine" },
    { id: "e-ronald", name: "Ronald", gender: "masculine" },
    { id: "shared", name: "Shared", gender: "feminine" },
  ],
  ja: [{ id: "shared", name: "Shared", gender: "feminine" }],
};
const ORDER = ["vi", "en", "ja"];

test("a carried-over clone loses its locale tag and keeps the language for its flag", () => {
  assert.deepEqual(profileDisplay("My voice (vi-VN)"), { name: "My voice", language: "vi" });
  assert.deepEqual(profileDisplay("Tú · giọng thuyết trình", "vi-VN"), {
    name: "Tú · giọng thuyết trình",
    language: "vi",
  });
  assert.deepEqual(profileDisplay("Podcast (ja)"), { name: "Podcast", language: "ja" });
});

test("a name that is only a tag is not emptied", () => {
  assert.equal(profileDisplay("(vi-VN)").name, "(vi-VN)");
});

test("the library opens on the language you speak, or on everything when it has no voices", () => {
  assert.equal(initialLibraryLanguage("vi-VN", ORDER), "vi");
  assert.equal(initialLibraryLanguage("ko", ORDER), ALL_LANGUAGES);
  assert.equal(initialLibraryLanguage(null, ORDER), ALL_LANGUAGES);
});

test("one language lists its own voices, each tagged with that language", () => {
  const voices = libraryVoices(CATALOGS, ORDER, "vi");
  assert.deepEqual(voices.map((voice) => voice.name), ["Lien", "Linh", "Minh"]);
  assert.ok(voices.every((voice) => voice.language === "vi"));
});

test("all languages lists a voice offered twice only once, under the first language", () => {
  const voices = libraryVoices(CATALOGS, ORDER, ALL_LANGUAGES);
  assert.equal(voices.filter((voice) => voice.id === "shared").length, 1);
  assert.equal(voices.find((voice) => voice.id === "shared")?.language, "en");
});

test("five rows, then Show all fills the same box and scrolls", () => {
  const twelve = Array.from({ length: 12 }, (_, index) => index);
  const closed = libraryWindow(twelve, false);
  assert.equal(closed.rows.length, LIBRARY_VISIBLE_ROWS);
  assert.equal(closed.hiddenCount, 7);
  assert.equal(closed.scrolls, false);

  const open = libraryWindow(twelve, true);
  assert.equal(open.rows.length, 12);
  assert.equal(open.scrolls, true);
});

test("a short list has no Show all and never scrolls", () => {
  const three = libraryWindow([1, 2, 3], true);
  assert.equal(three.hiddenCount, 0);
  assert.equal(three.scrolls, false);
});
