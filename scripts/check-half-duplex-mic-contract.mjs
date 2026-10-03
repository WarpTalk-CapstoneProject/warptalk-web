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

// ---- Barge-in -------------------------------------------------------------------------------
// The gate used to hold the microphone shut for the WHOLE dub, so a listener's reply during one was
// never sent — never transcribed, translated or dubbed. Testers heard it as "the clone voice skips
// segments". These keep the barge-in that fixes it from quietly turning back into either failure:
// a deaf gate, or an open one.

const detectorSource = readFileSync("src/lib/meeting/barge-in.ts", "utf8");

check(
  "a listener talking over a dub can open the gate",
  /new BargeInDetector\(\)/.test(source) && /periodRef\.current && !detector\.open/.test(source),
  "Without the barge-in this is strict half duplex again: everything said while a dub plays is " +
    "dropped on this machine, where no server log can ever show it.",
);

check(
  "the barge-in listens on a clone of the microphone, not the gated track",
  /source\.clone\(\)/.test(source) && /copy\.enabled = true/.test(source),
  "The gate disables the original track, and a disabled track reads as silence — measuring it " +
    "would make the listener inaudible to the very check that is meant to hear them. A clone " +
    "copies `enabled`, so it has to be switched on explicitly.",
);

check(
  "the barge-in compares against the dub actually being played",
  /syncDubProbes/.test(source) && /referenceRms: combineRms\(/.test(source),
  "Echo is the dub, attenuated. A level threshold on the microphone alone cannot tell a listener " +
    "from their own speakers; the dub's level is what makes the comparison mean anything.",
);

check(
  "an uncalibrated or deaf barge-in keeps the gate shut",
  /coupling === null \? Number\.POSITIVE_INFINITY/.test(detectorSource) &&
    /const speech = referenceFresh && /.test(detectorSource),
  "Every uncertain state must fall back to the old gate, never to an open microphone: before the " +
    "echo path is measured, or while the dub's own audio reads as silence, the echo itself would " +
    "clear a bare speech floor and be transcribed as the listener.",
);

check(
  "the barge-in decides nothing for a user who has muted themselves",
  /const tick = \(\) => \{[\s\S]*?if \(!room\.localParticipant\.isMicrophoneEnabled\) return;/.test(source),
  "Their mute outranks every automatic decision here.",
);

check(
  "the barge-in is measured on a timer, not on animation frames",
  /setInterval\(tick, BARGE_IN_TICK_MS\)/.test(source) && !/requestAnimationFrame/.test(source),
  "requestAnimationFrame stops in a background tab, and a meeting tab is often in the background — " +
    "the barge-in would silently stop working exactly when the user is looking at something else.",
);

check(
  "the measuring machinery is torn down with the gate",
  /stopTicker\(\);[\s\S]*audioContext\.close\(\)/.test(source) && /micProbe\.copy\.stop\(\)/.test(source),
  "A leaked clone keeps the microphone's capture alive after the meeting, and a leaked timer keeps " +
    "measuring a room the user has left.",
);

if (failures.length > 0) {
  console.error(`\nHalf-duplex mic contract failed:\n\n  ${failures.join("\n\n  ")}\n`);
  process.exit(1);
}
console.log("\nHalf-duplex mic contract passed.");
