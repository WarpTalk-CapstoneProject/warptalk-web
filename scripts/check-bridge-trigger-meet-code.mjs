#!/usr/bin/env node
/**
 * The bridge trigger is TOLD which Meet each room is, not left to guess.
 *
 * `nextBridgeTrigger` refuses a sighting whose room code disagrees with the meeting's — that
 * comparison is the only thing standing between "the user is in THIS meeting" and "the user has
 * some Meet window open". It is also the only defence against two concurrent calls, where the
 * schedule alone says both are plausible.
 *
 * That comparison was dead for as long as it existed. `extractMeetCodeFromUrl` was written,
 * exported and unit-tested, and the app shell — the one place that builds TriggerMeeting values —
 * never called it, so `meeting.meetCode` was always undefined and `codeConflict` could never be
 * true. A pure function with tests and no caller looks healthy from every angle except the one
 * that matters, which is why this check greps the CALLER rather than the helper.
 *
 * If the room ever stops carrying `externalMeetingUrl`, rewrite this to assert whatever the code
 * comes from instead — do not delete it, or the comparison goes quietly back to sleep.
 */

import { readFileSync } from "node:fs";

const FILE = "src/app/(app)/layout.tsx";
const source = readFileSync(FILE, "utf8");

const failures = [];

if (!/extractMeetCodeFromUrl/.test(source)) {
  failures.push(
    "the app shell never calls extractMeetCodeFromUrl — every TriggerMeeting it builds has no " +
      "meetCode, so nextBridgeTrigger cannot tell this meeting's Meet window from any other",
  );
}

if (!/meetCode:\s*extractMeetCodeFromUrl\(\s*room\.externalMeetingUrl\s*\)/.test(source)) {
  failures.push(
    "no `meetCode: extractMeetCodeFromUrl(room.externalMeetingUrl)` in the TriggerMeeting the " +
      "shell assembles — the room carries the Meet URL, and this is where it becomes a code the " +
      "sensor's sighting can be checked against",
  );
}

/**
 * The same lesson, twice more: the trigger is also TOLD when translation is running and when a
 * meeting ended.
 *
 * `useBridgeTrigger` has taken a translation flag since it was written and `TriggerMeeting` has
 * had an `endsAtMs`, and the shell passed neither. The pure half answered `running` correctly in
 * every test while, in the product, a room with no end time left its trigger window at start + one
 * hour in the middle of a translated call - closing the popup that held Stop translation, or, with
 * Meet on screen, navigating it to the offer. Again: grep the caller, not the helper.
 */
const triggerCall = /useBridgeTrigger\(\s*\{([^}]*)\}\s*\)/.exec(source);
if (!triggerCall) {
  failures.push(
    "no `useBridgeTrigger({ ... })` call in the app shell — the floating bridge widget has no " +
      "owner for a meeting nobody opened in WarpTalk",
  );
} else if (!/\btranslatingRoomId\b/.test(triggerCall[1])) {
  failures.push(
    "useBridgeTrigger is not given `translatingRoomId` — the trigger cannot tell a translation in " +
      "progress from a meeting whose window has run out, and drops the popup mid-translation",
  );
}

if (!/endsAtMs:/.test(source)) {
  failures.push(
    "the TriggerMeeting the shell assembles carries no `endsAtMs` — a room that has ended keeps the " +
      "widget armed until the one-hour ceiling instead of letting go when the meeting did",
  );
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${FILE}\n     ${failure}`);
  process.exit(1);
}

console.log(
  "PASS the bridge trigger is given each room's Meet code, its end, and the room being translated",
);
