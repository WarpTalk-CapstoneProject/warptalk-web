import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveSavedVoiceForLanguage,
  resolveVoicePreference,
} from "./voice-preference.ts";

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
