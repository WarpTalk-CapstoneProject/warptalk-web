#!/usr/bin/env node
/**
 * Ending a meeting is single-flight.
 *
 * Production, 30 Sep: one "End for Everyone" became six `POST /meetings/rooms/{id}/end` requests
 * in under a second. The dialog button stayed live while the first request waited on LiveKit, so
 * each press sent another end — and each one published its own `__MEETING_END__`, so the meeting
 * was summarised six times and carried six "System" lines in its transcript. The backend now ends
 * a meeting once however many requests race (warptalk-backend fix/k8s-replica-dedupe-backend);
 * this keeps the client from sending them in the first place.
 *
 * Two layers, both required:
 *   - the two end mutations route through singleFlight, so EVERY entry point (the live top bar,
 *     the room page's actions menu, the bridge widget, the session's own exit) shares one request
 *     per room while it is in flight, and releases it on failure so End can be retried;
 *   - the controls say so: the End for Everyone button is disabled while its request runs, and
 *     the session's exit handler ignores a second call until the first settles.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");

const meetingHooks = await read("src/hooks/use-meeting.ts");
assert.match(
  meetingHooks,
  /export function useEndMeetingForAll[\s\S]*?singleFlight\(endMeetingFlightKey\(roomId\)/,
  "useEndMeetingForAll must send its request through singleFlight(endMeetingFlightKey(roomId), ...).",
);

const roomHooks = await read("src/hooks/use-translationRooms.ts");
assert.match(
  roomHooks,
  /export function useEndTranslationRoom[\s\S]*?singleFlight\(endRoomFlightKey\(id\)/,
  "useEndTranslationRoom must send its request through singleFlight(endRoomFlightKey(id), ...).",
);

const topBar = await read("src/components/rooms/live/meeting-top-bar.tsx");
// The dialog copy moved into the message catalog (i18n), so anchor on its key, not the English text.
const endAnchor = topBar.indexOf('t("exitControl.endDialogTitle")');
assert.ok(endAnchor >= 0, "the End for Everyone dialog must still be found in meeting-top-bar.tsx.");
const endButton = topBar.slice(endAnchor);
assert.match(
  endButton,
  /disabled=\{endForAll\.isPending\}/,
  "the End for Everyone button must be disabled while its request is in flight.",
);
assert.match(
  endButton,
  /if \(endForAll\.isPending\) return;/,
  "the End for Everyone handler must ignore a press while the end is in flight.",
);

const session = await read("src/components/rooms/live/persistent-meeting-session.tsx");
assert.match(
  session,
  /async function handleExit\(action: "leave" \| "end"\) \{\s*(?:\/\/[^\n]*\n\s*)*if \(exitInFlightRef\.current\) return;/,
  "handleExit must return early while another leave/end is in flight.",
);
assert.match(
  session,
  /finally \{\s*exitInFlightRef\.current = false;/,
  "handleExit must release its single-flight guard when the exit settles, success or failure.",
);

const roomPage = await read("src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx");
assert.match(roomPage, /endPending=\{endRoomMutation\.isPending\}/, "the room page's End menu item must know the end is in flight.");
assert.match(roomPage, /disabled=\{endPending\}/, "the room page's End menu item must be disabled while the end is in flight.");

const bridge = await read("src/components/rooms/bridge/widget/end-session.tsx");
assert.match(bridge, /if \(ending\) return;/, "the bridge widget's End must ignore a press while ending.");

console.log("End single-flight contract passed.");
