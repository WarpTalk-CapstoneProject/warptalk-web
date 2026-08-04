import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const hook = await readFile(
  new URL("../src/hooks/use-track-processors.ts", import.meta.url),
  "utf8",
);
const preferences = await readFile(
  new URL("../src/lib/track-effects-preferences.ts", import.meta.url),
  "utf8",
);
const meetingJoinState = await readFile(
  new URL("../src/lib/meeting-join-state.ts", import.meta.url),
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
assert.match(hook, /await localAudioTrack\.setProcessor\(krispRef\.current\)/);
assert.match(hook, /onNoiseSuppressionError\?\.\(error\)/);
assert.match(roomPage, /onNoiseSuppressionError=\{handleNoiseSuppressionError\}/);
assert.match(roomPage, /setNoiseSuppressionEnabled\(false\)/);
assert.match(roomPage, /Browser noise suppression remains enabled/);
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
assert.match(
  roomPage,
  /getUserMedia\(\{[\s\S]*?video:\s*cameraEnabled\s*\?\s*true\s*:\s*false,[\s\S]*?audio:\s*false,/,
  "the camera preview must not open a second competing microphone capture",
);
assert.match(
  hook,
  /noiseSuppression:\s*!noiseSuppressionEnabled/,
  "Krisp and browser noise suppression must not run on the same audio",
);
assert.match(hook, /voiceIsolation:\s*!noiseSuppressionEnabled/);
assert.match(hook, /autoGainControl:\s*true/);
assert.match(hook, /await mediaStreamTrack\.applyConstraints/);
for (const prejoinSurface of [joinPage, setupModal]) {
  assert.match(
    prejoinSurface,
    /noiseSuppressionPreferenceVersion:\s*NOISE_SUPPRESSION_PREFERENCE_VERSION/,
    "prejoin surfaces must write the same preference version consumed by the room",
  );
}

console.log("Track processor fallback contract passed.");
