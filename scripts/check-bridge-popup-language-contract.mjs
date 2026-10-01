#!/usr/bin/env node
/**
 * W4b (WT-868): the bridge popup's one language flow, its roles, and the shared bridge claim.
 *
 * WHY THIS EXISTS
 *   Each rule below is invisible from the file that breaks it: a pill that draws its own copy of the
 *   picker compiles and looks right until the meeting's picker changes; a dead-end sentence is a
 *   string; an auto-room that goes back to `createRoom` passes every test of the planner. These are
 *   the call sites.
 *
 *   1. No dead end. The "Open the WarpTalk window…" copy is gone from the popup; when nobody runs
 *      the room the popup asks the main window to carry it (activateBridgeRoom) and otherwise offers
 *      "Show WarpTalk" (showDesktopMainWindow).
 *   2. The picker IS the native one: one LanguageColumn (language-column.tsx) used by the meeting's
 *      picker and by the popup's menu, with the meeting's own copy; the dock pill and the language
 *      step both draw that menu, and a pick goes through the relay's `set-language`.
 *   3. The language step opens a never-started room, with Start through the dock's start sequence.
 *   4. Roles: the popup's Start/Stop, Pause and "They speak" are gated on `canControl` (host OR
 *      capturer), not on the host alone.
 *   5. Auto-room CLAIMS (`claimBridgeRoom`), never creates; the capturer heartbeat runs in the main
 *      window's meeting session, never in the popup.
 *
 * Comments are stripped first: the explanations in the files name the very calls being checked.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "./lib/strip-comments.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function code(relativePath) {
  const full = join(root, relativePath);
  if (!existsSync(full)) {
    failures.push(`${relativePath} is missing.`);
    return "";
  }
  return stripComments(readFileSync(full, "utf8"));
}

function filesUnder(relativeDir) {
  const dir = join(root, relativeDir);
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...filesUnder(relative(root, full)));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(relative(root, full));
  }
  return found;
}

function expect(source, pattern, label, why) {
  if (!pattern.test(source)) failures.push(`${label}: ${why}`);
}

function forbid(source, pattern, label, why) {
  if (pattern.test(source)) failures.push(`${label}: ${why}`);
}

const WIDGET = "src/components/rooms/bridge/widget";

// 1. No dead end ─────────────────────────────────────────────────────────────
const DEAD_ENDS = [
  /Open the WarpTalk window to change/i,
  /Open this meeting in the WarpTalk window/i,
  /Checking the WarpTalk window/i,
];
for (const file of filesUnder(WIDGET)) {
  const source = code(file);
  for (const pattern of DEAD_ENDS) {
    forbid(source, pattern, file, `still carries the dead-end copy ${pattern}. The popup asks the main window to carry the room and offers "Show WarpTalk"; the sentence is i18n'd in rooms.bridgeWidget.`);
  }
}

const state = code(`${WIDGET}/use-bridge-widget-state.ts`);
expect(state, /\bactivateBridgeRoom\(/, "use-bridge-widget-state.ts", "no longer asks the main window to carry a room nobody answers for (activateBridgeRoom). The language, Text | Voice and voice controls would be dead in a popup the trigger or the tray opened.");
const carry = code(`${WIDGET}/relay-carry-notice.tsx`);
expect(carry, /\bshowDesktopMainWindow\(/, "relay-carry-notice.tsx", "no longer offers \"Show WarpTalk\" (showDesktopMainWindow) for the real no-main-window case.");
expect(carry, /useTranslations\(\s*["']rooms\.bridgeWidget["']/, "relay-carry-notice.tsx", "is not translated (rooms.bridgeWidget).");

const layout = code("src/app/(app)/layout.tsx");
expect(layout, /onBridgeRoomActivated\([\s\S]*?openMeeting\(/, "layout.tsx", "no longer turns a popup's activation into openMeeting.");

// 2. The picker is the native one ────────────────────────────────────────────
const COLUMN_IMPORT = /from\s+["']@\/components\/rooms\/live\/language-column["']/;
const controlBar = code("src/components/rooms/live/meeting-control-bar.tsx");
expect(controlBar, COLUMN_IMPORT, "meeting-control-bar.tsx", "does not use the shared LanguageColumn. The popup and the meeting must draw one picker.");
forbid(controlBar, /function\s+LanguageColumn\b/, "meeting-control-bar.tsx", "defines its own LanguageColumn again; the popup would drift from it.");

const menu = code(`${WIDGET}/bridge-language-menu.tsx`);
expect(menu, COLUMN_IMPORT, "bridge-language-menu.tsx", "does not draw the native LanguageColumn.");
expect(menu, /useTranslations\(\s*["']meetingControlBar["']/, "bridge-language-menu.tsx", "does not use the meeting picker's own copy (meetingControlBar.languagePicker).");
expect(menu, /languagePicker\.myLanguage\.title/, "bridge-language-menu.tsx", "lost the \"My language\" header.");
expect(menu, /languagePicker\.otherLanguages\.disclosure/, "bridge-language-menu.tsx", "lost the \"Another language\" disclosure.");
expect(menu, /\bbridgeLanguageOptions\(/, "bridge-language-menu.tsx", "does not build its options from bridgeLanguageOptions (the L1/L2 rule).");
expect(menu, /\bpickLanguage\(/, "bridge-language-menu.tsx", "no longer relays the pick (set-language) to the main window.");
for (const file of filesUnder(WIDGET)) {
  if (file.endsWith("bridge-language-menu.tsx")) continue;
  forbid(code(file), /function\s+LanguageColumn\b/, file, "draws its own LanguageColumn instead of the native one.");
}

const pill = code(`${WIDGET}/dock-language-pill.tsx`);
expect(pill, /<BridgeLanguageMenu\b/, "dock-language-pill.tsx", "does not draw the shared native menu.");

// 3. The language step ───────────────────────────────────────────────────────
const step = code(`${WIDGET}/start-step.tsx`);
expect(step, /<BridgeLanguageMenu\b/, "start-step.tsx", "does not draw the shared native menu.");
expect(step, /\buseStartBridgeTranslation\(/, "start-step.tsx", "does not start through the dock's start sequence (activate → open → /resume).");
const shell = code(`${WIDGET}/widget-shell.tsx`);
expect(shell, /<BridgeStartStep\b/, "widget-shell.tsx", "no longer opens a never-started room on the language step.");
expect(shell, /\bneverStarted\b/, "widget-shell.tsx", "no longer keys the language step on neverStarted.");
expect(shell, /<RelayCarryNotice\b/, "widget-shell.tsx", "no longer says when nobody runs the room.");
expect(shell, /<CaptureTakeoverNotice\b/, "widget-shell.tsx", "no longer offers a member the capture takeover.");

// 4. Roles ───────────────────────────────────────────────────────────────────
const dock = code(`${WIDGET}/dock-session-controls.tsx`);
expect(dock, /if\s*\(\s*!canControl\s*\)\s*return null/, "dock-session-controls.tsx", "is not gated on canControl (host OR capturer).");
const farSide = code(`${WIDGET}/dock-far-side-language-pill.tsx`);
expect(farSide, /!canControl\b/, "dock-far-side-language-pill.tsx", "\"They speak\" is not gated on canControl (host OR capturer).");
forbid(farSide, /!isHost\b/, "dock-far-side-language-pill.tsx", "\"They speak\" is gated on the host alone again.");
expect(state, /\bcanControlBridge\(/, "use-bridge-widget-state.ts", "does not derive canControl from canControlBridge.");

// 5. Claim, and the heartbeat where the capture is ─────────────────────────────
const autoRoom = code("src/hooks/use-bridge-auto-room.ts");
expect(autoRoom, /\bclaimBridgeRoom\(/, "use-bridge-auto-room.ts", "does not claim the Meet call (POST /translation-rooms/bridge/claim).");
forbid(autoRoom, /\buseCreateTranslationRoom\b|\.create\(|\bcreateRoom\b/, "use-bridge-auto-room.ts", "creates a room again. Every user in the call would get their own room, each capturing the far side.");
expect(autoRoom, /\bplanBridgeClaim\(/, "use-bridge-auto-room.ts", "does not plan the claim body (planBridgeRoomLanguages via planBridgeClaim).");

const session = code("src/components/rooms/live/persistent-meeting-session.tsx");
expect(session, /\buseBridgeCapturerLease\(/, "persistent-meeting-session.tsx", "does not run the capturer lease (heartbeat, takeover) in the main window.");
expect(session, /bridgeRole:\s*isBridgeRoom\s*\?\s*bridgeLease\.bridgeRole/, "persistent-meeting-session.tsx", "does not tell the popup this desktop's bridge role.");
expect(session, /onTakeOverCapture:/, "persistent-meeting-session.tsx", "does not answer the popup's takeover.");
const lease = code("src/hooks/use-bridge-capturer-lease.ts");
expect(lease, /\bheartbeatBridgeCapturer\(/, "use-bridge-capturer-lease.ts", "no longer renews the lease.");
expect(lease, /\btakeOverBridgeCapturer\(/, "use-bridge-capturer-lease.ts", "no longer takes the capture over.");
for (const file of filesUnder(WIDGET)) {
  forbid(code(file), /\bheartbeatBridgeCapturer\b/, file, "renews the capturer lease from the popup. A popup that outlives the main window would keep a dead capture \"live\".");
}

if (failures.length > 0) {
  console.error("check-bridge-popup-language-contract: FAILED\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("check-bridge-popup-language-contract: ok");
