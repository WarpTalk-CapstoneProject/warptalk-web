#!/usr/bin/env node
/**
 * W4a: the popup over Google Meet is the bridge meeting's only UI, and the main window really
 * answers it.
 *
 * WHY THIS EXISTS
 *   WT-901 gave the relay the meeting's own fields and five intents (stop, pause/resume, rejoin,
 *   device settings, open record), and the popup started sending them — but the session called the
 *   host hook with none of them, so every one of those buttons reached a main window that did
 *   nothing: Rejoin never showed (no `idleReaped`), Pause stayed "not available" (no
 *   `transcriptPause`), Device settings and Open meeting record were silent no-ops. Each piece looks
 *   finished on its own; only the call site shows that nothing is connected. These are the call
 *   sites.
 *
 *   1. No End meeting in the popup (PO, 2026-10-01): the room ends with its Meet conference.
 *   2. The session passes the WT-901 fields AND the native handlers to useBridgeWidgetRelayHost.
 *   3. ENDED → the room page, for a bridge too: the TranslationRoomEnded handler hands the room off
 *      (popup told, shell takes over, main window shown) and then navigates the way native does.
 *   4. The shell answers the ended popup's "Open meeting record" (navigate + show the window).
 *   5. The desktop shell is told the sign-in state (`reportSignedIn`), from the root providers.
 *   6. The main window draws no bridge widget; its dock is headless for a bridge.
 *   7. The wizard's Speakers line reads the FINAL inbound path, not `device-while-asking`.
 *   8. web #646: a displaced session (another login took the meeting) is mirrored to the popup and
 *      its "Use this device" reaches the native take-over. The in-window card that offered it went
 *      with the bridge widget (6), and a merge that kept `isBridgeRoom ? null` left the session
 *      displaced with the gating intact and the button unreachable.
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

const SESSION = "src/components/rooms/live/persistent-meeting-session.tsx";
const LAYOUT = "src/app/(app)/layout.tsx";
const PROVIDERS = "src/app/providers.tsx";
const REPORTER = "src/components/providers/desktop-auth-state-reporter.tsx";
const DESKTOP = "src/lib/desktop/bridge.ts";
const ENDED_HOST = "src/hooks/use-bridge-ended-relay-host.ts";
const WIZARD = "src/components/rooms/bridge/bridge-setup-wizard.tsx";
const DOCK = "src/components/rooms/live/mini-meeting-dock.tsx";
const RELAY_HOST = "src/hooks/use-bridge-widget-relay-host.ts";

const session = code(SESSION);
const layout = code(LAYOUT);

// ── 1. no End meeting in the popup ───────────────────────────────────────────
const popupFiles = [
  ...filesUnder("src/components/rooms/bridge/widget"),
  ...filesUnder("src/app/desktop-transcript"),
];
if (popupFiles.length === 0) failures.push("found no popup sources — were they moved?");
for (const file of popupFiles) {
  const source = code(file);
  if (/End meeting|End for all|endMeeting|useEndTranslationRoom|useEndMeetingForAll/i.test(source)) {
    failures.push(
      `${file} offers to end the meeting. The popup has Start/Stop translation and Pause/Resume `
        + `transcript only; a bridge room ends when its Google Meet conference does (PO, 2026-10-01).`,
    );
  }
}

// ── 2. the host hook gets the meeting and the native handlers ────────────────
const hostCall = /useBridgeWidgetRelayHost\(\{([\s\S]*?)\n {2}\}\);/.exec(session)?.[1] ?? "";
if (!hostCall) {
  failures.push(`${SESSION} no longer calls useBridgeWidgetRelayHost({ … }).`);
} else {
  const wanted = [
    [/\btranslation: \{ started: translationStarted \}/, "translation (the popup's Start/Stop state)"],
    [/\btranscriptPause,/, "transcriptPause (without it Pause stays \"not available\")"],
    [/\bcreditsSuspended:/, "creditsSuspended"],
    [/\bcreditsSuspendedReason:/, "creditsSuspendedReason"],
    [/\bmeetingError,/, "meetingError"],
    // Indent-anchored: the connection helper's argument carries the same words.
    [/\n {4}idleReaped: meetingIsIdleReaped,/,"idleReaped (without it Rejoin never shows)"],
    [/\bconnection: bridgeMeetingConnection\(/, "connection"],
    [/\bisRoomHost,/, "isRoomHost"],
    // W4b: host OR bridge capturer (canControlBridge, PO 2026-10-01), still the native handlers.
    [/onStopTranslation: (?:isRoomHost|bridgeCanControl) \? handleStopWarptalk : undefined/, "onStopTranslation → the native Stop"],
    [/onSetTranscriptPaused: (?:isRoomHost|bridgeCanControl) \? \(paused\) => commitTranscriptPause\(paused\)/,
      "onSetTranscriptPaused → commitTranscriptPause (WT-605; the popup has already confirmed)"],
    [/onRejoin: \(\) => \{\s*markMeetingInteraction\(\);\s*setIdleDisconnected\(false\);/, "onRejoin → the idle reaper's way back"],
    [/onOpenSetup: \(\) => \{\s*setBridgeSetupOpen\(true\);\s*void showDesktopMainWindow\(\);/, "onOpenSetup → the wizard + the main window shown"],
    [/onOpenRoomRecord: \(\) => \{\s*router\.push\(roomDetailPath\([^)]*roomId\)\);\s*void showDesktopMainWindow\(\);/,
      "onOpenRoomRecord → the room page + the main window shown"],
  ];
  for (const [pattern, what] of wanted) {
    expect(hostCall, pattern, SESSION, `useBridgeWidgetRelayHost is not given ${what}.`);
  }
  if (/\b_paused_rooms\b|setRoomPaused|pauseRoom/.test(hostCall)) {
    failures.push(`${SESSION}: the popup's Pause is the WT-605 transcript pause, not a room pause.`);
  }
}

// ── 3. ENDED → the room page, for a bridge too ───────────────────────────────
const endedHandler =
  /connection\.on\("TranslationRoomEnded", \(\) => \{([\s\S]*?)\n {4}\}\);/.exec(session)?.[1] ?? "";
expect(
  endedHandler,
  /handOffEndedBridgeRef\.current\(\);\s*onMeetingClosed\(\);\s*router\.replace\(roomDetailPath\(activeWorkspaceSlug \|\| "workspace", roomId\)\);/,
  SESSION,
  "TranslationRoomEnded must hand a bridge room off, then close and replace() onto the room page "
    + "exactly as native does — in that order, the hand-off before the unmount.",
);
expect(
  session,
  /handOffEndedBridgeRef\.current = \(\) => \{\s*if \(!isBridgeRoom\) return;[\s\S]{0,400}?announceBridgeRoomEnded\(\);[\s\S]{0,200}?onBridgeMeetingEnded\?\.\(roomId\);[\s\S]{0,300}?showDesktopMainWindow\(\);/,
  SESSION,
  "the bridge hand-off must tell the popup (announceEnded), hand the room to the shell "
    + "(onBridgeMeetingEnded) and bring the main window up (showDesktopMainWindow).",
);
expect(
  layout,
  /onBridgeMeetingEnded=\{setEndedBridgeRoomId\}/,
  LAYOUT,
  "the shell no longer takes the ended bridge room from the session.",
);

// ── 4. the shell answers the ended popup ─────────────────────────────────────
expect(
  layout,
  /useBridgeEndedRelayHost\(\{[\s\S]*?onOpenRoomRecord: \(endedRoomId\) => \{\s*router\.push\(roomDetailPath\([^)]*endedRoomId\)\);\s*void showDesktopMainWindow\(\);/,
  LAYOUT,
  "the shell must answer the ended popup's open-room-record: the room page here, window shown.",
);
const endedHost = code(ENDED_HOST);
expect(endedHost, /case "open-room-record":\s*openRef\.current\(roomId\);/, ENDED_HOST, "open-room-record is not dispatched.");
expect(endedHost, /buildEndedBridgeWidgetSnapshot\(/, ENDED_HOST, "the shell must answer with the ended snapshot.");

// ── 5. reportSignedIn ────────────────────────────────────────────────────────
const desktop = code(DESKTOP);
expect(desktop, /showMainWindow\?: \(\) => Promise<void>/, DESKTOP, "DesktopBridge lacks the optional showMainWindow.");
expect(desktop, /reportSignedIn\?: \(signedIn: boolean\) => void/, DESKTOP, "DesktopBridge lacks the optional reportSignedIn.");
expect(desktop, /bridge\.reportSignedIn\(signedIn\)/, DESKTOP, "reportDesktopSignedIn never calls reportSignedIn.");
expect(desktop, /bridge\.showMainWindow\(\)/, DESKTOP, "showDesktopMainWindow never calls showMainWindow.");
const reporter = code(REPORTER);
expect(reporter, /reportDesktopSignedIn\(signedIn\)/, REPORTER, "the reporter never reports.");
expect(reporter, /useAuthStore\.subscribe\(/, REPORTER, "the reporter must follow every auth change, not only the first.");
expect(reporter, /onFinishHydration\(/, REPORTER, "the first report must wait for the persisted session.");
expect(code(PROVIDERS), /<DesktopAuthStateReporter \/>/, PROVIDERS, "the root providers do not mount DesktopAuthStateReporter.");

// ── 6. no main-window bridge widget ──────────────────────────────────────────
if (existsSync(join(root, "src/components/rooms/live/external-bridge-widget.tsx"))) {
  failures.push("external-bridge-widget.tsx is back. The popup is the only bridge widget (WT-868).");
}
expect(session, /\{isBridgeRoom \? null : compact \? \(/, SESSION, "a bridge room must render no in-window widget.");
expect(layout, /<MiniMeetingDock floating=\{meetingWidgetFloating\} headless=\{activeMeetingIsBridge\}>/, LAYOUT,
  "the dock around a bridge meeting must be headless (hidden, still mounted).");
expect(code(DOCK), /hidden=\{headless\}/, DOCK, "the headless dock must hide the SAME element, not swap it.");

// ── 7. the wizard reads the final path ───────────────────────────────────────
expect(code(WIZARD), /const inboundPath = finalBridgeInboundPath\(\s*inbound\s*\)/, WIZARD,
  "the Speakers instruction must come from the final inbound path, not the transient device-while-asking.");

// ── 7b. one owner for the inbound decision, one source for the verdicts ──────
// decideBridgeInbound is the only caller of selectBridgeInboundSource; the session and the wizard
// both call it, the wizard with the meeting's own inbound device id rather than its tone probe.
expect(code(WIZARD), /const inbound = decideBridgeInbound\(\{[\s\S]{0,300}inboundDeviceId: resolvedInboundDeviceId/, WIZARD,
  "the wizard must decide the inbound path through decideBridgeInbound with the meeting's device id.");
expect(session, /const bridgeInbound = decideBridgeInbound\(\{[\s\S]{0,300}inboundDeviceId: bridgeInboundDeviceId/, SESSION,
  "the session must decide the inbound path through decideBridgeInbound.");
expect(session, /<BridgeSetupDialog[\s\S]{0,400}inboundDeviceId=\{bridgeInboundDeviceId\}/, SESSION,
  "the wizard must be given the session's inbound device id, so both decisions share their inputs.");
for (const file of [WIZARD, SESSION]) {
  if (/selectBridgeInboundSource\(/.test(code(file))) {
    failures.push(`${file} calls selectBridgeInboundSource directly — go through decideBridgeInbound.`);
  }
  if (/currentBridgeDeviceLabels\(/.test(code(file))) {
    failures.push(`${file} reads the fallback device labels directly — use bridgeDeviceLabelsFor(status).`);
  }
}
expect(code(WIZARD), /bridgeDevicesReadyWithProbe\(status, result\)/, WIZARD,
  "the wizard's devices-ready must be the desktop verdict, downgraded by the probe (bridgeDevicesReadyWithProbe).");

// ── 8. a displaced session can be taken back from the popup ──────────────────
expect(hostCall, /\n {4}sessionDisplaced,/, SESSION,
  "useBridgeWidgetRelayHost is not given sessionDisplaced (the popup never shows \"Use this device\").");
expect(hostCall, /\bonTakeOverSession: takeOverDisplacedSession\b/, SESSION,
  "the popup's \"Use this device\" must run the native takeOverDisplacedSession.");
expect(hostCall, /\bdisplaced: sessionDisplaced,/, SESSION,
  "the popup's connection note must say disconnected, not connecting, while another login has the meeting.");
expect(
  code(RELAY_HOST),
  /case "take-over-session":\s*if \(handlers\.onTakeOverSession && acceptsSessionTakeOver\(fieldsRef\.current\.sessionDisplaced\)\)/,
  RELAY_HOST,
  "take-over-session must be acted on only while displaced; a stale one would evict the other login again.",
);

if (failures.length) {
  console.error(`FAIL bridge W4a wiring (${failures.length}):\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log(
  "PASS the popup has no End; the session hands the popup its meeting state and the native stop, "
    + "pause, rejoin, wizard and record handlers; an ended bridge room lands on its page with the "
    + "popup told and the shell answering; the desktop is told the sign-in state; no in-window "
    + "bridge widget; the wizard names the final inbound path; a displaced session is taken back from "
    + "the popup",
);
