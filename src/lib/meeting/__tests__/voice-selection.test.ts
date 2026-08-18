import assert from "node:assert/strict";
import test from "node:test";

import { describeVoiceSelection } from "../voice-selection.ts";

/**
 * "Which voice will the other side actually hear."
 *
 * Two controls for one decision, and three switches underneath them in two services. On 15 Aug
 * the whole team tried to hear a cloned voice, could not, and concluded cloning was broken — while
 * the worker logged voice_clone_sample_accepted with score 1.0. Nothing in the meeting told them
 * which voice was in use, so there was no way to tell a real failure from an unmade choice.
 */

const CATALOG = [
  { id: "voice-a", name: "Linh", gender: "female" },
  { id: "voice-b", name: "Minh", gender: "male" },
];

test("transcript-only wins over every voice question", () => {
  // It is about what THIS person receives, and holds whether or not anybody is dubbing them.
  const selection = describeVoiceSelection({
    voiceEnabled: false,
    voiceCloneEnabled: true,
    dubVoice: "voice-a",
    voiceCatalog: CATALOG,
  });

  assert.equal(selection.kind, "transcript-only");
});

test("a deliberately picked dub voice outranks a live clone", () => {
  // The order the worker resolves them in — see TTSWorker._resolve_voice_variants. Reporting the
  // clone while the pipeline uses the pick would be the same lie this module exists to stop.
  const selection = describeVoiceSelection({
    voiceCloneEnabled: true,
    dubVoice: "voice-a",
    voiceCatalog: CATALOG,
  });

  assert.equal(selection.kind, "picked");
  assert.equal(selection.label, "Linh");
});

test("consent to clone, with no voice picked, is the clone", () => {
  const selection = describeVoiceSelection({ voiceCloneEnabled: true, voiceCatalog: CATALOG });

  assert.equal(selection.kind, "cloned");
  assert.equal(selection.label, "My voice");
});

test("a picked voice is named, not just confirmed", () => {
  const selection = describeVoiceSelection({ dubVoice: "voice-b", voiceCatalog: CATALOG });

  assert.equal(selection.kind, "picked");
  assert.equal(selection.label, "Minh");
  assert.match(selection.detail, /Minh/);
});

test("one of your own uploaded voices is named too", () => {
  // It is not in the public catalogue, so looking there alone would report a voice somebody
  // recorded of themselves as "Unavailable".
  const selection = describeVoiceSelection({
    dubVoice: "own-1",
    voiceCatalog: CATALOG,
    ownVoiceProfiles: [{ name: "My reading voice", voiceId: "own-1" }],
  });

  assert.equal(selection.kind, "picked");
  assert.equal(selection.label, "My reading voice");
});

test("a dub voice the catalog no longer offers says so", () => {
  // Changing language changes the catalog. Reading this as "Automatic" — which the old row did —
  // hides that the choice was dropped.
  const selection = describeVoiceSelection({ dubVoice: "voice-gone", voiceCatalog: CATALOG });

  assert.equal(selection.kind, "picked");
  assert.equal(selection.label, "Unavailable voice");
  assert.match(selection.detail, /not offered for this language/);
});

test("the default admits it is a stand-in", () => {
  const selection = describeVoiceSelection({ voiceCatalog: CATALOG });

  assert.equal(selection.kind, "automatic");
  assert.match(selection.detail, /assigned rather than matched/);
});

test("with no audience the choice is marked inert, not off", () => {
  // The distinction the team spent an afternoon on: no route out of you means nothing you pick
  // here changes what anyone hears. Reporting it as "off" would be the same lie reversed.
  const selection = describeVoiceSelection({ voiceCloneEnabled: true, hasAudience: false });

  assert.equal(selection.kind, "cloned", "the stored choice is still what it is");
  assert.equal(selection.inert, true);
  assert.match(selection.detail, /Nobody is listening in another language/);
});

test("with an audience nothing extra is claimed", () => {
  const selection = describeVoiceSelection({ voiceCloneEnabled: true, hasAudience: true });

  assert.equal(selection.inert, false);
  assert.doesNotMatch(selection.detail, /Nobody is listening/);
});
