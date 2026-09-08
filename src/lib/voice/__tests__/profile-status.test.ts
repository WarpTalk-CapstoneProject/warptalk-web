import assert from "node:assert/strict";
import test from "node:test";

import { isLibraryVoicePointer, ownVoiceProfiles } from "../profile-status.ts";

/**
 * Telling somebody's own voice apart from their pick of a library voice.
 *
 * These two live in one table and stopped being distinguishable. `SetPreferredVoiceAsync`
 * writes Provider "cartesia" for a pick; `CollectFinishedClonesAsync` writes the same Provider
 * onto an UPLOAD once it has finished cloning, because a clone lives in the Cartesia account
 * too. Source does not separate them either — the entity defaults it to "upload" and the
 * preference path never sets it.
 *
 * So every predicate that asked "is this the library voice I picked?" by provider and language
 * answered yes for the person's own clone. That is what put a raw provider UUID in the stand-in
 * rail, put "Untitled profile" under Your voices, and offered a catalogue pointer in the
 * be-dubbed-in-this picker.
 */
const OWN_UPLOAD = {
  id: "1",
  displayName: "My presenting voice",
  language: "vi-VN",
  provider: "cartesia",
  providerVoiceId: "clone-abc",
} as never;

const OWN_CARRY_OVER = {
  id: "2",
  displayName: "My voice (vi-VN)",
  language: "vi-VN",
  provider: "cartesia",
  providerVoiceId: "clone-def",
} as never;

const STILL_CLONING = {
  id: "3",
  displayName: "Podcast voice",
  language: "en-US",
  provider: null,
  providerVoiceId: null,
} as never;

const LIBRARY_PICK = {
  id: "4",
  displayName: null,
  language: "vi",
  provider: "cartesia",
  providerVoiceId: "935a9060-373c-49e4-b078-f4ea6326987a",
} as never;

test("a finished upload is the person's own voice, not a library pointer", () => {
  // The regression itself: provider and language alone cannot tell these apart.
  assert.equal(isLibraryVoicePointer(OWN_UPLOAD), false);
});

test("a carry-over clone is the person's own voice too", () => {
  assert.equal(isLibraryVoicePointer(OWN_CARRY_OVER), false);
});

test("a nameless row pointing at a catalogue voice is a library pick", () => {
  assert.equal(isLibraryVoicePointer(LIBRARY_PICK), true);
});

test("a profile still being cloned is never mistaken for a pointer", () => {
  // Failure direction on purpose: a row with no provider voice yet stays with the person's own
  // voices even if it somehow lost its name, because hiding somebody's real voice is worse
  // than showing one stray row.
  assert.equal(isLibraryVoicePointer({ ...(STILL_CLONING as object), displayName: null } as never), false);
});

test("a blank name is as absent as a null one", () => {
  assert.equal(isLibraryVoicePointer({ ...(LIBRARY_PICK as object), displayName: "   " } as never), true);
});

test("Your voices keeps every voice the person made and drops the pointer", () => {
  const own = ownVoiceProfiles([OWN_UPLOAD, LIBRARY_PICK, STILL_CLONING, OWN_CARRY_OVER]);

  assert.deepEqual(
    own.map((profile) => profile.id),
    ["1", "3", "2"],
  );
});
