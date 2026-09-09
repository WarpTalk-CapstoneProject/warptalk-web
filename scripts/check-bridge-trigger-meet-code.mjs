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

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${FILE}\n     ${failure}`);
  process.exit(1);
}

console.log("PASS the bridge trigger is given each room's Meet code");
