import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const hook = await readFile(
  new URL("../src/hooks/use-track-processors.ts", import.meta.url),
  "utf8",
);
const preferences = await readFile(
  new URL("../src/lib/meeting/track-effects-preferences.ts", import.meta.url),
  "utf8",
);
const meetingJoinState = await readFile(
  new URL("../src/lib/meeting/meeting-join-state.ts", import.meta.url),
  "utf8",
);
const roomPage = await readFile(
  new URL("../src/components/rooms/live/persistent-meeting-session.tsx", import.meta.url),
  "utf8",
);
const joinPage = await readFile(
  new URL("../src/app/(app)/join/page.tsx", import.meta.url),
  "utf8",
);
const setupModal = await readFile(
  new URL("../src/components/rooms/setup-room-modal.tsx", import.meta.url),
  "utf8",
);

assert.match(hook, /onNoiseSuppressionError\?: \(error: unknown\) => void/);
assert.match(hook, /await localAudioTrack\.setProcessor\(krisp\b/);
assert.match(hook, /onNoiseSuppressionError\?\.\(error\)/);
assert.match(roomPage, /onNoiseSuppressionError=\{handleNoiseSuppressionError\}/);
assert.match(roomPage, /setNoiseSuppressionEnabled\(false\)/);
// The GUARANTEE, not the sentence. WT-427 split one message into three, because the three ways
// Krisp fails are different problems — and for an unentitled LiveKit project the old copy was
// actively false, telling the user to reload when reloading cannot help.
//
// What must still hold is that the handler reports through the classifier rather than inventing
// its own wording, and that every branch of the classifier says the microphone is still filtered.
// The branches themselves are pinned in lib/meeting/__tests__/noise-suppression-failure.test.ts.
assert.match(
  roomPage,
  /handleNoiseSuppressionError[\s\S]{0,400}?describeNoiseSuppressionFailure\(error\)/,
  "the failure must be classified, not collapsed into one message for three different causes",
);
const failureClassifier = await readFile(
  new URL("../src/lib/meeting/noise-suppression-failure.ts", import.meta.url),
  "utf8",
);
assert.match(
  failureClassifier,
  /browser's own noise suppression/,
  "every failure message must say the microphone is still filtered — this is a downgrade, not an outage",
);
assert.doesNotMatch(
  roomPage,
  /handleNoiseSuppressionError[\s\S]*?writeTrackEffectsPreferences\(\{\s*noiseSuppressionEnabled:\s*false\s*\}\)/,
  "a transient Krisp failure must be retried after reload, not persisted forever",
);
// THE DEFAULT IS NOW ON, and this assertion used to say the opposite. Read this before changing
// it back, because the reason it said the opposite has been fixed rather than forgotten.
//
//   The rule was written on 2026-07-30 as "Krisp must remain opt-in after a production room
//   published frames but no speech chunks" — a participant whose audio published fine and
//   produced no transcript at all. At that date the hook disabled the browser's own suppression
//   FIRST and attached Krisp second, with no rollback; production's CSP was missing
//   'wasm-unsafe-eval', so the attach threw every time and left a WebAudio track carrying
//   nothing, with the browser's denoiser already stood down. Frames, no speech. That is the
//   symptom the rule was protecting against.
//
//   Three separate fixes later removed it: the CSP token, attach-before-stand-down, and the
//   explicit isEnabled() check (WT-320) — all three asserted further down this file, which is
//   where the protection now lives. Defaulting to on with those in place cannot reproduce the
//   July failure: every path that does not end with Krisp genuinely running restores the
//   browser's suppression before it reports.
//
// So the pin moved from "the default" to "the version gate exists and an opt-out survives it".
// The version is what lets the default change without overriding somebody who said no.
assert.match(
  preferences,
  /NOISE_SUPPRESSION_PREFERENCE_VERSION\s*=\s*\d+/,
  "the preference version must exist — it is what makes changing the default safe",
);
assert.match(
  meetingJoinState,
  /noiseSuppressionPreferenceVersion\s*===\s*[\s\S]*?NOISE_SUPPRESSION_PREFERENCE_VERSION\s*\?\s*roomDevices\.noiseSuppressionEnabled\s*===\s*true\s*:\s*true/,
  "a preference at the CURRENT version must be honoured either way, and anything older must fall "
    + "through to the default rather than pinning somebody to a value that was never a choice",
);

// The outcome must reach the server, whichever way it went. Krisp runs in the browser and fails
// silently; without this the only record of "it is not running" is a console.error in one tab, and
// turning it on for everybody without that record would be turning on something unobservable.
assert.match(
  hook,
  /onNoiseSuppressionOutcome\?\.\(\{\s*enabled:\s*true,\s*processor:\s*"krisp"\s*\}\)/,
  "a working filter must be reported too — 'it failed for one person' and 'it has never worked' "
    + "are different problems, and only the successes tell them apart",
);
assert.ok(
  (hook.match(/onNoiseSuppressionOutcome\?\./g) ?? []).length >= 3,
  "every outcome must be reported: enabled, unsupported browser, and failed to enable",
);
assert.match(
  roomPage,
  /reportNoiseSuppression/,
  "the meeting must actually send the outcome somewhere a person can read it later",
);
assert.match(
  roomPage,
  /audio=\{\s*microphoneEnabled\s*\?\s*\{[\s\S]*?echoCancellation:\s*true,[\s\S]*?noiseSuppression:\s*true,[\s\S]*?voiceIsolation:\s*true,[\s\S]*?autoGainControl:\s*true,[\s\S]*?channelCount:\s*1,[\s\S]*?\}\s*:\s*false\s*\}/,
);
assert.equal(
  [...roomPage.matchAll(/autoGainControl:\s*true/g)].length,
  1,
  "the published LiveKit microphone must use AGC for quiet laptop microphones",
);
assert.equal(
  [...roomPage.matchAll(/voiceIsolation:\s*true/g)].length,
  1,
  "published LiveKit microphone must request voice isolation",
);
// Was: assert that the room page's own getUserMedia() preview passed `audio: false`, so it
// could not fight LiveKit for the microphone. That preview is gone — it fed a <video> element
// meeting-stage had already dropped, so it opened a second capture of the camera (LED on) and
// rendered nothing. The rule it encoded is now absolute rather than conditional: <LiveKitRoom>
// owns the only capture of either device on this surface.
assert.doesNotMatch(
  roomPage,
  /getUserMedia\(/,
  "the live meeting surface must not open a capture that competes with LiveKit's own",
);
// The two denoisers must never run on the same audio — stacking them distorted the production
// mic PCM — so exactly one constraint pair drives both, and it is a parameter rather than an
// expression derived from the toggle. The previous version of this contract pinned
// `noiseSuppression: !noiseSuppressionEnabled` at the applyConstraints call site, which is how
// the ORDER bug survived review: it locked in *what* was set while saying nothing about *when*.
assert.match(hook, /noiseSuppression:\s*enabled/);
assert.match(hook, /voiceIsolation:\s*enabled/);
assert.match(hook, /autoGainControl:\s*true/);
assert.match(hook, /applyConstraints/);

// ORDER. Krisp has to be carrying the audio before the browser's denoiser is stood down.
// Reversed — which is what shipped — a Krisp that fails (its WASM was blocked by a CSP missing
// 'wasm-unsafe-eval') left the microphone with NO suppression at all, making the toggle strictly
// worse than off while the UI claimed browser suppression was still running.
const krispAttach = hook.indexOf("setProcessor(krisp)");
// Takes the capture track since the OverconstrainedError fix: with Krisp attached,
// `localAudioTrack.mediaStreamTrack` is the processor's WebAudio output, which supports none
// of these constraints. See check-krisp-capture-track-contract.mjs.
const standDownBrowser = hook.indexOf("setBrowserSuppression(captureTrack, false)");
assert.ok(krispAttach !== -1, "Krisp must still be attached");
assert.ok(standDownBrowser !== -1, "the browser denoiser must be stood down explicitly");
assert.ok(
  krispAttach < standDownBrowser,
  "Krisp must be attached BEFORE the browser's noise suppression is disabled",
);

// Attaching is not running. setProcessor() resolves even on a LiveKit project that cannot run
// Krisp — init() only fetches a public manifest, and the real gate is setEnabled(), which logs
// and returns false rather than throwing. Catching the throw alone left that silent path
// surrendering browser suppression to an inert filter, which is WT-320.
const enableCall = hook.indexOf("setEnabled(true)");
const enabledCheck = hook.indexOf("isEnabled()");
assert.ok(enableCall !== -1, "Krisp must be explicitly enabled, not just attached");
assert.ok(enabledCheck !== -1, "Krisp's own enabled state must be checked");
assert.ok(
  enabledCheck < standDownBrowser,
  "Krisp must report itself ENABLED before the browser's suppression is given up",
);

// And the failure path must put the microphone back before anyone is told about it.
assert.match(
  hook,
  /catch \(error\) \{[\s\S]*?setBrowserSuppression\(captureTrack, true\)[\s\S]*?onNoiseSuppressionError\?\.\(error\)/,
  "a failed Krisp must restore browser suppression BEFORE reporting, or the report is a lie",
);
for (const prejoinSurface of [joinPage, setupModal]) {
  assert.match(
    prejoinSurface,
    /noiseSuppressionPreferenceVersion:\s*NOISE_SUPPRESSION_PREFERENCE_VERSION/,
    "prejoin surfaces must write the same preference version consumed by the room",
  );
}

console.log("Track processor fallback contract passed.");

// WT-427. The Krisp processor is dropped whenever it can no longer be reused: after stopping, on
// failure, and when the microphone track it was bound to goes away.
//
// It was created once and never cleared, so the FIRST enable of a session could work and every
// later one attached a processor that had already released its WASM pipeline. Since WT-320 this
// hook treats "attached but not enabled" as an error, so that is a toggle which refuses to stay on
// for the rest of the meeting.
//
// The blur processor beside it already did this and says why. Three sites, because missing any one
// of them brings the bug back through a different door.
const krispDrops = hook.match(/krispRef\.current = null/g) ?? [];
assert.ok(
  krispDrops.length >= 3,
  `The Krisp processor must be dropped after stopping, on failure, and on track change — found ${krispDrops.length} of 3. Reusing a stopped processor is how the second enable of a session silently does nothing.`,
);
