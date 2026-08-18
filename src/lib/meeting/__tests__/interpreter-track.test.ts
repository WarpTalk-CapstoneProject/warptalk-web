import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseInterpreterIdentity,
  resolveInterpreterTracks,
} from "../interpreter-track.ts";

const EN = "en";
const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const MY_VOICE = "aabbccdd-9999-0000-0000-000000000000";
const SOMEBODY_ELSES_VOICE = "eeff0011-9999-0000-0000-000000000000";

const defaultTrack = (speaker: string) => `ai-interpreter-${EN}-${speaker}`;
const voiceTrack = (voice: string, speaker: string) =>
  `ai-interpreter-${EN}-voice-${voice.slice(0, 8)}-${speaker}`;

describe("parseInterpreterIdentity", () => {
  it("reads the shared default track", () => {
    assert.deepEqual(parseInterpreterIdentity(defaultTrack(ALICE), EN), {
      speakerId: ALICE,
      isPreference: false,
    });
  });

  it("reads a picked-voice track and recovers the speaker behind it", () => {
    assert.deepEqual(parseInterpreterIdentity(voiceTrack(MY_VOICE, ALICE), EN), {
      speakerId: ALICE,
      isPreference: true,
    });
  });

  it("ignores an interpreter in another language", () => {
    assert.equal(parseInterpreterIdentity(`ai-interpreter-vi-${ALICE}`, EN), null);
  });

  it("ignores a human participant", () => {
    assert.equal(parseInterpreterIdentity(ALICE, EN), null);
  });
});

describe("resolveInterpreterTracks", () => {
  it("plays the speaker's own track when this listener has no preference", () => {
    const resolved = resolveInterpreterTracks({
      identities: [defaultTrack(ALICE)],
      targetLanguageNormalized: EN,
      voicePreference: null,
    });

    assert.equal(resolved.get(defaultTrack(ALICE)), ALICE);
  });

  it("KEEPS the speaker's own voice even when this listener has picked one", () => {
    // The regression this file exists for. A cloned speaker publishes only the default track,
    // and the old rule rejected it outright once the listener had any preference — so the
    // listener fell through to that speaker's raw microphone and heard the untranslated
    // original, while the speaker saw "My voice" and a successful capture.
    const resolved = resolveInterpreterTracks({
      identities: [defaultTrack(ALICE)],
      targetLanguageNormalized: EN,
      voicePreference: MY_VOICE,
    });

    assert.equal(resolved.get(defaultTrack(ALICE)), ALICE);
  });

  it("prefers this listener's voice for a speaker who has no voice of their own", () => {
    const resolved = resolveInterpreterTracks({
      identities: [defaultTrack(ALICE), voiceTrack(MY_VOICE, ALICE)],
      targetLanguageNormalized: EN,
      voicePreference: MY_VOICE,
    });

    assert.equal(resolved.get(voiceTrack(MY_VOICE, ALICE)), ALICE);
    // Exactly one of the two is played, or the listener hears the sentence twice.
    assert.equal(resolved.get(defaultTrack(ALICE)), null);
  });

  it("never plays a voice another listener picked", () => {
    const resolved = resolveInterpreterTracks({
      identities: [defaultTrack(ALICE), voiceTrack(SOMEBODY_ELSES_VOICE, ALICE)],
      targetLanguageNormalized: EN,
      voicePreference: MY_VOICE,
    });

    assert.equal(resolved.get(voiceTrack(SOMEBODY_ELSES_VOICE, ALICE)), null);
    // And that other listener's track must not be mistaken for ours and suppress the default.
    assert.equal(resolved.get(defaultTrack(ALICE)), ALICE);
  });

  it("decides per speaker, not per room", () => {
    // Alice is cloned (default only). Bob is not, and this listener picked a voice for him.
    const resolved = resolveInterpreterTracks({
      identities: [defaultTrack(ALICE), defaultTrack(BOB), voiceTrack(MY_VOICE, BOB)],
      targetLanguageNormalized: EN,
      voicePreference: MY_VOICE,
    });

    assert.equal(resolved.get(defaultTrack(ALICE)), ALICE, "Alice keeps her cloned voice");
    assert.equal(resolved.get(voiceTrack(MY_VOICE, BOB)), BOB, "Bob is heard in the picked voice");
    assert.equal(resolved.get(defaultTrack(BOB)), null, "and not twice");
  });

  it("ignores tracks in a language this listener is not tuned to", () => {
    const resolved = resolveInterpreterTracks({
      identities: [`ai-interpreter-vi-${ALICE}`, defaultTrack(BOB)],
      targetLanguageNormalized: EN,
      voicePreference: null,
    });

    assert.equal(resolved.has(`ai-interpreter-vi-${ALICE}`), false);
    assert.equal(resolved.get(defaultTrack(BOB)), BOB);
  });

  it("says nothing about human participants", () => {
    const resolved = resolveInterpreterTracks({
      identities: [ALICE, BOB],
      targetLanguageNormalized: EN,
      voicePreference: null,
    });

    assert.equal(resolved.size, 0);
  });
});
