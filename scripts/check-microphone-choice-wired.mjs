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
 * THE RULES
 *   1. Both pre-join screens put selectedMicrophoneId into the join record.
 *   2. The session reads it back and hands it to <LiveKitRoom options> through
 *      microphoneRoomOptions — the Room's capture default, which also covers a participant who
 *      joins muted and turns the microphone on later (the `audio` prop is read only on connect).
 *   3. The `audio` prop does NOT name a device. Passed there, it would override the Room's
 *      capture default on every reconnect and undo a switch made mid-meeting.
 *   4. The session sets the id only while hydrating. <LiveKitRoom> builds a new Room whenever its
 *      options change, so writing a mid-meeting switch back into this state would drop the call.
 *   5. The meeting bar's picker switches a microphone as a preference (exact: false) and records
 *      the pick, so a reload keeps it and an unplugged device falls back instead of throwing.
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
}

// ---- Rules 2–4: the session --------------------------------------------------------------------
const session = stripComments(read(SESSION));

if (!/setSelectedMicrophoneId\(\s*preferences\.selectedMicrophoneId\s*\)/.test(session)) {
  failures.push(`${SESSION}: expected the hydrated preferences to set selectedMicrophoneId.`);
}

if (!/microphoneRoomOptions\(\s*selectedMicrophoneId\s*\)/.test(session)) {
  failures.push(`${SESSION}: expected the room options to be built with microphoneRoomOptions.`);
}

const liveKitRoom = session.match(/<LiveKitRoom\b([\s\S]*?)\n\s*>/);
if (!liveKitRoom) {
  failures.push(`${SESSION}: could not find the <LiveKitRoom> element.`);
} else {
  if (!/\boptions=\{liveKitRoomOptions\}/.test(liveKitRoom[1])) {
    failures.push(
      `${SESSION}: <LiveKitRoom> is not given options={liveKitRoomOptions}, so the chosen ` +
        `microphone never reaches LiveKit.`,
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

const setterCalls = session.match(/\bsetSelectedMicrophoneId\(/g) ?? [];
if (setterCalls.length !== 1) {
  failures.push(
    `${SESSION}: setSelectedMicrophoneId is called ${setterCalls.length} times; expected once, ` +
      `while hydrating. It seeds the Room's construction options, and a change there rebuilds the ` +
      `Room — a mid-meeting switch written back here would drop the call.`,
  );
}

// ---- Rule 5: the meeting bar ---------------------------------------------------------------------
const menu = stripComments(read(DEVICE_MENU));

if (!/kind === "audioinput" \? \{ exact: false \}/.test(menu)) {
  failures.push(
    `${DEVICE_MENU}: a microphone must be switched with { exact: false }. LiveKit keeps the ` +
      `constraint as the room's capture default, and an exact id outlives an unplugged device.`,
  );
}

if (!/rememberSelectedMicrophone\(/.test(menu)) {
  failures.push(
    `${DEVICE_MENU}: a microphone picked in the meeting is not recorded, so a reload puts the ` +
      `participant back on the device they just left.`,
  );
}

if (failures.length > 0) {
  console.error("microphone-choice contract FAILED:\n");
  for (const f of failures) console.error(`  • ${f}\n`);
  process.exit(1);
}

console.log("microphone-choice contract OK");
