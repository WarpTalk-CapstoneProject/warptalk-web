import assert from "node:assert/strict";
import test from "node:test";
import {
  describeSavedVoice,
  resolveSavedVoiceForLanguage,
  resolveVoicePreference,
} from "../voice-preference.ts";

const LINH = "935a9060-373c-49e4-b078-f4ea6326987a";
const MINH = "0e58d60a-2f1a-4252-81bd-3db6af45fb41";
const SKYLAR = "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4";

const VI_CATALOG = [{ id: LINH }, { id: MINH }];

const savedVi = [{ provider: "cartesia", providerVoiceId: LINH, language: "vi" }];

test("the saved profile default applies when nothing was chosen in this room", () => {
  assert.equal(resolveVoicePreference(null, "vi", savedVi, VI_CATALOG), LINH);
});

test("a pick made in this room wins over the saved default", () => {
  const selection = { language: "vi", voiceId: MINH };

  assert.equal(resolveVoicePreference(selection, "vi", savedVi, VI_CATALOG), MINH);
});

test("clearing the voice in this room is respected, not overwritten by the saved default", () => {
  // This is the case the whole {language, voiceId} shape exists for: "cleared here" and
  // "hasn't chosen here" must not collapse into the same thing.
  const cleared = { language: "vi", voiceId: null };

  assert.equal(resolveVoicePreference(cleared, "vi", savedVi, VI_CATALOG), null);
});

test("a pick for a different language does not leak into this one", () => {
  const englishPick = { language: "en", voiceId: SKYLAR };

  assert.equal(resolveVoicePreference(englishPick, "vi", savedVi, VI_CATALOG), LINH);
});

test("locale-tagged and bare language codes match", () => {
  // Rooms carry "vi-VN"; the catalog and the saved profile may carry either.
  const savedLocale = [{ provider: "cartesia", providerVoiceId: LINH, language: "vi-VN" }];

  assert.equal(resolveSavedVoiceForLanguage(savedLocale, "vi", VI_CATALOG), LINH);
  assert.equal(resolveSavedVoiceForLanguage(savedVi, "vi-VN", VI_CATALOG), LINH);
});

test("a saved voice the provider no longer offers for this language is ignored", () => {
  // Passing it on would have synthesis fall back to some other voice, which reads as the
  // preference being ignored rather than stale.
  const stale = [{ provider: "cartesia", providerVoiceId: "retired-voice", language: "vi" }];

  assert.equal(resolveSavedVoiceForLanguage(stale, "vi", VI_CATALOG), null);
});

test("nothing is applied while the catalog is still cold", () => {
  assert.equal(resolveSavedVoiceForLanguage(savedVi, "vi", []), null);
});

test("a sample-upload profile is not treated as a library voice pick", () => {
  // Those rows have no provider/providerVoiceId — they are the older upload flow.
  const uploadProfile = [{ provider: null, providerVoiceId: null, language: "vi" }];

  assert.equal(resolveSavedVoiceForLanguage(uploadProfile, "vi", VI_CATALOG), null);
});

test("no saved profiles at all resolves to no preference", () => {
  assert.equal(resolveVoicePreference(null, "vi", undefined, VI_CATALOG), null);
});

/**
 * Naming a saved voice — and refusing to invent a name for one.
 *
 * The bug these pin: the settings rail printed the raw voice UUID whenever the catalogue
 * lookup missed. It missed routinely, because the catalogue is a TTL'd cache that is empty
 * until the AI worker's first synthesis into that language — and in exactly that window
 * `resolveSavedVoiceForLanguage` also drops the preference, so the readout was asserting a
 * setting was in effect at the one moment it was not.
 */
const NAMED_VI_CATALOG = [
  { id: LINH, name: "Linh - Soft Presence" },
  { id: MINH, name: "Minh - Warm Baritone" },
];

test("a voice the catalogue knows is named", () => {
  assert.deepEqual(describeSavedVoice(LINH, NAMED_VI_CATALOG, false), {
    state: "named",
    name: "Linh - Soft Presence",
  });
});

test("nothing saved is not a voice at all", () => {
  assert.deepEqual(describeSavedVoice(null, NAMED_VI_CATALOG, false), { state: "none" });
});

test("a cold catalogue never yields the raw id", () => {
  const label = describeSavedVoice(LINH, [], false);

  assert.deepEqual(label, { state: "unavailable" });
  assert.ok(!JSON.stringify(label).includes(LINH));
});

test("a still-loading catalogue says so rather than claiming the voice is gone", () => {
  assert.deepEqual(describeSavedVoice(LINH, [], true), { state: "loading" });
});

test("a name already in hand is not hidden behind a background refetch", () => {
  assert.deepEqual(describeSavedVoice(MINH, NAMED_VI_CATALOG, true), {
    state: "named",
    name: "Minh - Warm Baritone",
  });
});

test("a catalogue entry with a blank name is treated as unnamed, not as an empty label", () => {
  assert.deepEqual(describeSavedVoice(SKYLAR, [{ id: SKYLAR, name: "   " }], false), {
    state: "unavailable",
  });
});
