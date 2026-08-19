#!/usr/bin/env node
/**
 * The half-duplex gate can leave a microphone silent. These are the properties that keep it from
 * doing so by accident.
 *
 * A live session produced a transcript of Vietnamese fragments ("vườn.", "Đơn giản.", "Trong.",
 * "Ừ.") credited to somebody who had not spoken, while the other participant spoke English —
 * the room's own Vietnamese dub, coming out of the listener's speakers and back in through their
 * microphone. `stt_worker` then learned a `vi` language override from those fragments and stopped
 * translating for that person entirely.
 *
 * Asserted against the source rather than by rendering: the failure modes here are all "which
 * primitive, and in which order", and every one of them is visible as text.
 */

import { readFileSync } from "node:fs";

const SOURCE = "src/components/rooms/live/half-duplex-mic.tsx";
const WIRING = "src/components/rooms/live/filtered-room-audio.tsx";

const source = readFileSync(SOURCE, "utf8");
const wiring = readFileSync(WIRING, "utf8");

const failures = [];
function check(name, condition, why) {
  if (condition) {
    console.log(`PASS ${name}`);
    return;
  }
  failures.push(`${name}\n    ${why}`);
}

check(
  "the gate silences the media track, not the LiveKit publication",
  /track\.enabled = false/.test(source) &&
    !/setMicrophoneEnabled\(false\)/.test(source),
  "setMicrophoneEnabled would republish the track — re-running the Krisp processor effect and " +
    "flipping the mic button in every roster, several times a minute, for something that is not a mute.",
);

check(
  "a user's own mute always outranks the gate",
  /if \(!room\.localParticipant\.isMicrophoneEnabled\) return;/.test(source),
  "Re-enabling the track under a user's mute would publish audio from somebody who believes " +
    "they are muted. That is worse than the bug being fixed.",
);

check(
  "the microphone is released when the component goes away",
  /if \(gatedRef\.current\) openMic\(\);/.test(source),
  "A gate that unmounts while holding the mic down leaves a silent microphone with nothing " +
    "left running to release it.",
);

check(
  "the microphone is released when translation stops or the last dub leaves",
  /if \(enabled && dubIdentities\.length > 0\) return;/.test(source),
  "With no interpreter left to report isSpeaking, no event will ever arrive to reopen the mic.",
);

check(
  "reopening waits out a hangover rather than snapping back",
  /RELEASE_HANGOVER_MS/.test(source) && /setTimeout\(/.test(source),
  "Reopening in the gaps between sentences of one dubbed utterance lets exactly the fragments " +
    "this exists to stop back through.",
);

check(
  "both speaking signals are observed",
  /RoomEvent\.ActiveSpeakersChanged/.test(source) &&
    /ParticipantEvent\.IsSpeakingChanged/.test(source),
  "ActiveSpeakersChanged arrives on the SFU's own cadence; gating late is audible as a fragment " +
    "getting through.",
);

check(
  "interpreter bots that join mid-meeting are subscribed to",
  /RoomEvent\.ParticipantConnected/.test(source),
  "tts_worker creates the dub bot on the first synthesised chunk, so the participant that " +
    "matters is almost never present when this mounts.",
);

check(
  "only dubs playing to this listener's own output are gated against",
  /AI_INTERPRETER_PREFIX/.test(wiring) && /localDubIdentities/.test(wiring),
  "Gating on any speaker would cut the microphone whenever a human talks, which is a broken " +
    "meeting rather than an echo fix. The outbound bridge leg is excluded too — it plays into a " +
    "virtual device, not into the room the user is sitting in.",
);

check(
  "the gate is off when no pipeline is running",
  /enabled=\{translationActive\}/.test(wiring),
  "A room with no translation has no dubs, so there is nothing to gate and no reason to touch " +
    "the microphone at all.",
);

if (failures.length > 0) {
  console.error(`\nHalf-duplex mic contract failed:\n\n  ${failures.join("\n\n  ")}\n`);
  process.exit(1);
}
console.log("\nHalf-duplex mic contract passed.");
