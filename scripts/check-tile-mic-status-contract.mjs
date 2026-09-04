#!/usr/bin/env node
/**
 * WT-583: a participant tile says whether that participant's microphone is live.
 *
 * WHAT HAPPENED
 *
 * The stage drew a hand-raise badge, a pin/spotlight badge and a signal-strength badge on every
 * tile, and no microphone state at all. To find out whether the person who had gone quiet was
 * muted or just not talking, you had to leave the stage and open the People tab.
 *
 * THE SUBTLER HALF, WHICH IS WHY THIS SCRIPT EXISTS
 *
 * The People tab's microphone glyph is not mute. It reads `isTranslationAudioEnabled` from the
 * backend roster — the transcript-only toggle, "do not play me translated audio". Wiring the
 * tile badge to the same field would have looked correct in review, matched the panel it was
 * compared against, and been wrong in the one situation the ticket was raised about: somebody
 * pressing the mute button and nothing on their tile changing.
 *
 * So the assertions below are less about "a badge exists" than about WHERE IT READS FROM, and
 * about the event list that keeps it current. Both are easy to quietly regress.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  const full = join(root, relativePath);
  if (!existsSync(full)) return null;
  return readFileSync(full, "utf8");
}

const ICON = "src/components/rooms/live/mic-status-icon.tsx";
const STAGE = "src/components/rooms/live/meeting-stage.tsx";

const icon = read(ICON);
const stage = read(STAGE);

/**
 * The negative assertion below looks for a forbidden identifier, and the file it scans EXPLAINS
 * why that identifier is forbidden — so the prose tripped the check on the first run. Comments
 * are stripped before any "must not appear" test; naming the wrong answer in order to warn the
 * next reader off it is the opposite of the mistake being guarded against.
 */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

if (!icon) {
  failures.push(`${ICON} is missing; the participant tile has no microphone state to draw.`);
} else {
  if (!icon.includes("isMicrophoneEnabled")) {
    failures.push(
      `${ICON} does not read isMicrophoneEnabled. That LiveKit property IS the mute state — a ` +
        `published microphone publication that is not muted. Anything else answers a different ` +
        `question.`,
    );
  }

  if (withoutComments(icon).includes("isTranslationAudioEnabled")) {
    failures.push(
      `${ICON} reads isTranslationAudioEnabled. That is the roster's transcript-only toggle, ` +
        `not mute — see the People panel, which draws a microphone for it. A tile badge sourced ` +
        `from it would not move when somebody presses the mute button, which is the entire bug.`,
    );
  }

  /**
   * Mute/unmute alone leaves the badge stale for anyone whose microphone appears or disappears
   * after they join — no device at join time, a headset unplugged mid-call.
   */
  for (const event of [
    "RoomEvent.TrackMuted",
    "RoomEvent.TrackUnmuted",
    "RoomEvent.TrackPublished",
    "RoomEvent.TrackUnpublished",
  ]) {
    if (!icon.includes(event)) {
      failures.push(
        `${ICON} does not subscribe to ${event}. Without it the badge holds a stale answer for ` +
          `the rest of the meeting once that case occurs.`,
      );
    }
  }

  if (!icon.includes("useMaybeRoomContext")) {
    failures.push(
      `${ICON} should resolve the room itself (useMaybeRoomContext), the way NetworkQualityIcon ` +
        `does, so a tile can render it without the stage threading mute state through every ` +
        `layout branch.`,
    );
  }
}

if (!stage) {
  failures.push(`${STAGE} is missing.`);
} else if (!stage.includes("<MicStatusIcon")) {
  failures.push(
    `${STAGE} does not render MicStatusIcon. The component existing without a caller is the ` +
      `state this ticket was already in for every other bridge control — see WT-577.`,
  );
} else if (!/<MicStatusIcon\s+participantIdentity=\{identity\}/.test(stage)) {
  failures.push(
    `${STAGE} renders MicStatusIcon without participantIdentity={identity}. Omitting it makes ` +
      `the component follow the LOCAL participant, so every tile on the stage would show the ` +
      `viewer's own microphone.`,
  );
}

if (failures.length > 0) {
  console.error("FAIL participant tile microphone status contract\n");
  for (const failure of failures) console.error(`  - ${failure}\n`);
  process.exit(1);
}

console.log("PASS participant tiles show live microphone state, sourced from the track not the roster");
