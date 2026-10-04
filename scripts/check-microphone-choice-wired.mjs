#!/usr/bin/env node
/**
 * The microphone a participant picks is the one the meeting captures from.
 *
 * WHY THIS EXISTS (WT-631)
 *   Reported as "the native meeting may transcribe audio from other browser tabs". Both pre-join
 *   screens have a microphone picker, and their preview honours it — the level meter people watch
 *   before joining reads from the device they chose. The choice then went nowhere: the join
 *   record stored booleans only and <LiveKitRoom> was given no device, so LiveKit captured from
 *   whatever the OS calls the default input. On a demo laptop with VB-Cable installed that default
 *   can be the loopback, which carries every sound the machine plays.
 *
 *   The pieces were all present and unconnected, which is the shape the unit test in
 *   meeting-join-state.test.ts cannot see. So the wiring is checked here.
 *
 * 3 OCT 2026: THE DEVICE IS PINNED, AND THE SPEAKER COUNTS TOO
 *   Reported as "I pick another mic or speaker and it falls back to the default". WT-631 passed
 *   the microphone as `ideal`, a preference the browser may overrule — and did, silently, while
 *   the pre-join preview captured with `exact`. The speaker picker never reached the meeting at
 *   all. Both are pinned now, and only while the device still exists (see
 *   meetingDeviceRoomOptions), which keeps WT-631's protection against an unplugged headset.
 *
 * THE RULES
 *   1. Both pre-join screens put selectedMicrophoneId AND selectedSpeakerId into the join record.
 *   2. The session builds <LiveKitRoom options> with meetingDeviceRoomOptions from the browser's
 *      current device list (availableDeviceIds) — the Room's capture default, which also covers a
 *      participant who joins muted and turns the microphone on later, and its audio output.
 *   3. The `audio` prop does NOT name a device. Passed there, it would override the Room's
 *      capture default on every reconnect and undo a switch made mid-meeting.
 *   4. The session sets the options only while hydrating. <LiveKitRoom> builds a new Room whenever
 *      its options change, so writing a mid-meeting switch back into this state would drop the call.
 *   5. The meeting bar's picker switches with { exact: true } — never `exact: false` — records
 *      the pick for a microphone and for a speaker, so a reload keeps it, and says so when the
 *      switch fails instead of leaving the participant on another device.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/**
 * Comments are stripped first: the fix's own comments name the things these rules forbid, and a
 * contract that cannot tell code from a note about code punishes writing the note.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const JOIN_PAGE = "src/app/(app)/join/page.tsx";
const SETUP_MODAL = "src/components/rooms/setup-room-modal.tsx";
const SESSION = "src/components/rooms/live/persistent-meeting-session.tsx";
const DEVICE_MENU = "src/components/rooms/live/media-device-menu.tsx";

const failures = [];

// ---- Rule 1: both pre-join screens carry the choice ------------------------------------------
for (const file of [JOIN_PAGE, SETUP_MODAL]) {
  const source = stripComments(read(file));
  const deviceState = source.match(/deviceState:\s*\{([\s\S]*?)\}/);
  if (!deviceState) {
    failures.push(`${file}: expected completeMeetingJoin({ … deviceState: { … } }).`);
    continue;
  }
  if (!/\bselectedMicrophoneId\b/.test(deviceState[1])) {
    failures.push(
      `${file}: the join record does not carry selectedMicrophoneId, so the meeting captures ` +
        `from the OS default input instead of the microphone the participant just tested.`,
    );
  }
  if (!/\bselectedSpeakerId\b/.test(deviceState[1])) {
    failures.push(
      `${file}: the join record does not carry selectedSpeakerId, so the meeting plays through ` +
        `the default output whatever speaker was picked.`,
    );
  }
}

// ---- Rules 2–4: the session --------------------------------------------------------------------
const session = stripComments(read(SESSION));

if (!/meetingDeviceRoomOptions\(\s*choice\s*,\s*availableDeviceIds\(/.test(session)) {
  failures.push(
    `${SESSION}: expected the room options to be built with meetingDeviceRoomOptions over the ` +
      `browser's current device list (availableDeviceIds), so a device is pinned only while it exists.`,
  );
}
if (!/preferences\.selectedSpeakerId/.test(session)) {
  failures.push(`${SESSION}: the hydrated preferences' selectedSpeakerId is never read.`);
}

const liveKitRoom = session.match(/<LiveKitRoom\b([\s\S]*?)\n\s*>/);
if (!liveKitRoom) {
  failures.push(`${SESSION}: could not find the <LiveKitRoom> element.`);
} else {
  if (!/\boptions=\{liveKitRoomOptions\}/.test(liveKitRoom[1])) {
    failures.push(
      `${SESSION}: <LiveKitRoom> is not given options={liveKitRoomOptions}, so the chosen ` +
        `devices never reach LiveKit.`,
    );
  }
  const audioProp = liveKitRoom[1].match(/\baudio=\{([\s\S]*?)\n\s{8}\}/);
  if (audioProp && /\bdeviceId\b/.test(audioProp[1])) {
    failures.push(
      `${SESSION}: the <LiveKitRoom audio> prop names a device. It is re-applied on every ` +
        `reconnect and overrides the Room's capture default, undoing a mid-meeting switch.`,
    );
  }
}

const setterCalls = session.match(/\bsetDeviceRoomOptions\(/g) ?? [];
if (setterCalls.length !== 1) {
  failures.push(
    `${SESSION}: setDeviceRoomOptions is called ${setterCalls.length} times; expected once, ` +
      `while hydrating. It seeds the Room's construction options, and a change there rebuilds the ` +
      `Room — a mid-meeting switch written back here would drop the call.`,
  );
}

// ---- Rule 5: the meeting bar ---------------------------------------------------------------------
const menu = stripComments(read(DEVICE_MENU));

if (/exact:\s*false/.test(menu) || !/setActiveMediaDevice\(\s*device\.deviceId\s*,\s*\{\s*exact:\s*true\s*\}\s*\)/.test(menu)) {
  failures.push(
    `${DEVICE_MENU}: a device must be switched with { exact: true }. A preference lets the ` +
      `browser hand back the default device instead, silently.`,
  );
}

for (const recorder of ["rememberSelectedMicrophone", "rememberSelectedSpeaker"]) {
  if (!new RegExp(`\\b${recorder}\\(`).test(menu)) {
    failures.push(
      `${DEVICE_MENU}: ${recorder} is not called, so a reload puts the participant back on the ` +
        `device they just left.`,
    );
  }
}

if (!/toast\.error\(/.test(menu)) {
  failures.push(
    `${DEVICE_MENU}: a failed switch is not reported. The previous device stays active and the ` +
      `participant has no way to know their pick did not take.`,
  );
}

if (failures.length > 0) {
  console.error("microphone-choice contract FAILED:\n");
  for (const f of failures) console.error(`  • ${f}\n`);
  process.exit(1);
}

console.log("microphone-choice contract OK");
