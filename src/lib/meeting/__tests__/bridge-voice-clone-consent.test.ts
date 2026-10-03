import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_VOICE_CLONE_CONSENT_NAMES,
  MAX_VOICE_CLONE_CONSENT_NAME_LENGTH,
  consentedAmong,
  meetSideVoiceCloneNames,
} from "../bridge-voice-clone-consent.ts";
import { BRIDGE_STAND_IN_USER_ID } from "../bridge-far-side-language.ts";

// WT-933: the host ticks which Meet-side people agreed to voice cloning. The list is the caption
// names on the stand-in's transcript lines.

const HOST = "7b1d2c7e-4a51-4c1b-9a0e-2f6a3a9d1c11";

function meet(speakerName: string | null) {
  return { speakerId: BRIDGE_STAND_IN_USER_ID, speakerName };
}

test("lists Meet-side people in the order they first spoke", () => {
  const names = meetSideVoiceCloneNames([meet("Lan Nguyen"), meet("Minh"), meet("Lan Nguyen"), meet("An")]);
  assert.deepEqual(names, ["Lan Nguyen", "Minh", "An"]);
});

test("only the stand-in's lines count", () => {
  const names = meetSideVoiceCloneNames([
    { speakerId: HOST, speakerName: "Host Person" },
    { speakerId: null, speakerName: "Nobody's line" },
    meet("Minh"),
  ]);
  assert.deepEqual(names, ["Minh"]);
});

test("the stand-in's id matches whatever its casing", () => {
  const names = meetSideVoiceCloneNames([
    { speakerId: BRIDGE_STAND_IN_USER_ID.toUpperCase(), speakerName: "Minh" },
  ]);
  assert.deepEqual(names, ["Minh"]);
});

test("names are trimmed, and one person is one row whatever the casing or spacing", () => {
  const names = meetSideVoiceCloneNames([
    meet("  Trần  An "),
    meet("trần an"),
    meet("TRẦN AN"),
    meet("Ａｎ Ｎｇｕｙｅｎ"),
    meet("an nguyen"),
  ]);
  // The first spelling seen is the one kept.
  assert.deepEqual(names, ["Trần  An", "Ａｎ Ｎｇｕｙｅｎ"]);
});

test("the fallback label, the seat name, a bare id and an empty name are nobody", () => {
  const names = meetSideVoiceCloneNames([
    meet("Google Meet participants"),
    meet("google meet PARTICIPANTS "),
    meet("External Meeting"),
    meet(BRIDGE_STAND_IN_USER_ID),
    meet(""),
    meet("   "),
    meet(null),
    meet("Lan"),
  ]);
  assert.deepEqual(names, ["Lan"]);
});

test("a name the server would refuse for its length is left out", () => {
  const long = "x".repeat(MAX_VOICE_CLONE_CONSENT_NAME_LENGTH + 1);
  const longest = "y".repeat(MAX_VOICE_CLONE_CONSENT_NAME_LENGTH);
  assert.deepEqual(meetSideVoiceCloneNames([meet(long), meet(longest)]), [longest]);
});

test("the list stops at the status endpoint's limit, keeping the first speakers", () => {
  const segments = Array.from({ length: MAX_VOICE_CLONE_CONSENT_NAMES + 10 }, (_, index) =>
    meet(`Person ${index + 1}`),
  );
  const names = meetSideVoiceCloneNames(segments);
  assert.equal(names.length, MAX_VOICE_CLONE_CONSENT_NAMES);
  assert.equal(names[0], "Person 1");
  assert.equal(names.at(-1), `Person ${MAX_VOICE_CLONE_CONSENT_NAMES}`);
});

test("no segments, no names", () => {
  assert.deepEqual(meetSideVoiceCloneNames([]), []);
});

test("the status answer is kept to the names still listed", () => {
  assert.deepEqual(consentedAmong(["Lan", "Minh", "An"], ["An", "Lan", "Gone"]), ["Lan", "An"]);
  assert.deepEqual(consentedAmong(["Lan"], null), []);
  assert.deepEqual(consentedAmong(["Lan"], undefined), []);
});
