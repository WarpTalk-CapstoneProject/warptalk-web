#!/usr/bin/env node
/**
 * A new meeting must appear without a reload — and that needs four separate things to agree.
 *
 * THE CHAIN
 *   1. translation-room publishes `{eventType, workspaceId, roomId, ...}` on the meetings channel
 *      for EVERY room created (pinned on the backend by
 *      CreateTranslationRoomAsync_Publishes_EvenWhenNobodyIsInvited).
 *   2. Gateway's NotificationRedisSubscriberService relays it as `MeetingEvent` to the
 *      `workspace:{id}` group.
 *   3. This client joins that group via `SubscribeWorkspace`.
 *   4. Its handler invalidates the query key the room hooks actually use.
 *
 * WHY IT NEEDS A GUARD
 *   Link 1 was broken for months: the publish sat inside `if (InvitedEmails.Any())`, so a room
 *   created without typing anybody's email rang no bell and every other client had to press F5.
 *   It produced two contradictory reports of the same feature on the same evening, both correct,
 *   about two different ways of creating a room.
 *
 *   Links 3 and 4 are the fragile ones here, because they are a STRING agreeing with a string in
 *   another file. `QUERY_KEYS.TRANSLATION_ROOMS` and `MEETING_KEY` are declared independently;
 *   renaming either one breaks realtime silently — every query still works, nothing throws, the
 *   list is just quietly stale. That is the same "two names for one thing" failure as the billing
 *   cycle ("monthly" vs "month"), and it is invisible in review.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const PROVIDER = "src/components/providers/realtime-notification-provider.tsx";
const HOOKS = "src/hooks/use-translationRooms.ts";
const CONSTANTS = "src/constants/realtime.ts";
const DAY_PANEL = "src/components/home/meeting-day-panel.tsx";

const failures = [];
const provider = read(PROVIDER);
const hooks = read(HOOKS);
const constants = read(CONSTANTS);
const dayPanel = read(DAY_PANEL);

// ---- The two key declarations must name the SAME cache key --------------------------------
const queryKeysValue = constants.match(/TRANSLATION_ROOMS:\s*"([^"]+)"/)?.[1];
const meetingKeyValue = hooks.match(/const MEETING_KEY\s*=\s*\[\s*"([^"]+)"/)?.[1];

if (!queryKeysValue) {
  failures.push(`${CONSTANTS}: QUERY_KEYS.TRANSLATION_ROOMS is gone or no longer a literal.`);
}
if (!meetingKeyValue) {
  failures.push(`${HOOKS}: MEETING_KEY is gone or no longer a literal array.`);
}
if (queryKeysValue && meetingKeyValue && queryKeysValue !== meetingKeyValue) {
  failures.push(
    `${CONSTANTS} says QUERY_KEYS.TRANSLATION_ROOMS = "${queryKeysValue}" but ${HOOKS} builds its ` +
      `queries from MEETING_KEY = ["${meetingKeyValue}"]. The realtime handler would invalidate a ` +
      `key nothing uses: every list keeps working and silently stops updating on its own.`,
  );
}

// ---- The handler must actually invalidate it -----------------------------------------------
if (!/handleMeetingUpdate\s*=\s*\([\s\S]{0,600}?QUERY_KEYS\.TRANSLATION_ROOMS/.test(provider)) {
  failures.push(
    `${PROVIDER}: handleMeetingUpdate does not invalidate QUERY_KEYS.TRANSLATION_ROOMS, so a new ` +
      `meeting will not reach the Home day panel or the rooms list until a manual refresh.`,
  );
}

// ---- ...and must be listening, and in the workspace group -----------------------------------
if (!/hubConn\.on\(SIGNALR_EVENTS\.MEETING_EVENT/.test(provider)) {
  failures.push(`${PROVIDER}: nothing is bound to SIGNALR_EVENTS.MEETING_EVENT.`);
}
if (!/invoke\(\s*"SubscribeWorkspace"/.test(provider)) {
  failures.push(
    `${PROVIDER}: never invokes SubscribeWorkspace, so the Gateway's workspace-group broadcast ` +
      `cannot arrive at all.`,
  );
}

// ---- The day panel is the surface this was reported on --------------------------------------
if (!/useTranslationRooms\(/.test(dayPanel)) {
  failures.push(
    `${DAY_PANEL}: no longer reads through useTranslationRooms. If it now has its own query, this ` +
      `contract must be extended to cover that key too — otherwise the panel goes stale again.`,
  );
}

if (failures.length > 0) {
  console.error("meeting-realtime-wired contract FAILED:\n");
  for (const f of failures) console.error(`  • ${f}\n`);
  process.exit(1);
}

console.log("meeting-realtime-wired contract OK");
