/**
 * WT-709 — a language the host adds mid-meeting is offered by the picker straight away.
 *
 * The Gateway broadcasts RoomLanguagesChanged with the meeting's whole set; the session patches
 * it into the room query the picker reads. These pin the patch: it lands, it survives the two
 * sides spelling codes differently, it is a no-op when nothing changed, and a malformed payload
 * never blanks the picker.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRoomLanguages,
  parseRoomLanguages,
} from "../room-languages-changed.ts";

const room = {
  id: "room-1",
  sourceLanguage: "vi-VN",
  targetLanguages: ["en-US"],
};

test("a language the host added reaches the room the picker reads", () => {
  const languages = parseRoomLanguages({ sourceLanguage: "vi", targetLanguages: ["en", "ja"] });
  assert.ok(languages);

  const updated = applyRoomLanguages(room, languages);

  assert.deepEqual(updated.targetLanguages, ["en", "ja"]);
  // Everything else about the room is untouched.
  assert.equal(updated.id, "room-1");
  // Adding a language never changes the source, and the room's own spelling is kept: several
  // session effects compare against it.
  assert.equal(updated.sourceLanguage, "vi-VN");
});

test("the same set spelled differently is not a change", () => {
  // The broadcast is normalised server-side; the room DTO carries what was stored. Returning the
  // SAME object keeps React Query's reference, so nothing re-renders for a no-op.
  const languages = parseRoomLanguages({ sourceLanguage: "vi", targetLanguages: ["en"] });
  assert.ok(languages);

  assert.equal(applyRoomLanguages(room, languages), room);
});

test("a source that really changed is taken from the broadcast", () => {
  const languages = parseRoomLanguages({ sourceLanguage: "ja", targetLanguages: ["en"] });
  assert.ok(languages);

  assert.equal(applyRoomLanguages(room, languages).sourceLanguage, "ja");
});

test("an empty source in the broadcast does not erase the room's", () => {
  const languages = parseRoomLanguages({ sourceLanguage: "", targetLanguages: ["en", "ko"] });
  assert.ok(languages);

  const updated = applyRoomLanguages(room, languages);
  assert.equal(updated.sourceLanguage, "vi-VN");
  assert.deepEqual(updated.targetLanguages, ["en", "ko"]);
});

test("a payload that is not the backend's shape is refused, never applied", () => {
  // Writing `undefined` over the room's languages would empty the picker mid-meeting. The session
  // refetches the room instead.
  for (const payload of [
    null,
    undefined,
    "vi",
    ["vi", "en"],
    { sourceLanguage: "vi" },
    { targetLanguages: ["en"] },
    { sourceLanguage: "vi", targetLanguages: "en" },
    { sourceLanguage: "vi", targetLanguages: ["en", 3] },
  ]) {
    assert.equal(parseRoomLanguages(payload), null, JSON.stringify(payload));
  }
});
