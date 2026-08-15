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
assert.match(
  preferences,
  /NOISE_SUPPRESSION_PREFERENCE_VERSION\s*=\s*3/,
);
assert.match(
  meetingJoinState,
  /noiseSuppressionPreferenceVersion\s*===\s*[\s\S]*?NOISE_SUPPRESSION_PREFERENCE_VERSION[\s\S]*?noiseSuppressionEnabled\s*===\s*true/,
  "Krisp must remain opt-in after a production room published frames but no speech chunks",
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
const standDownBrowser = hook.indexOf("setBrowserSuppression(false)");
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
  /catch \(error\) \{[\s\S]*?setBrowserSuppression\(true\)[\s\S]*?onNoiseSuppressionError\?\.\(error\)/,
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
