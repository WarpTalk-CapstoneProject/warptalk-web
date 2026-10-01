#!/usr/bin/env node
/**
 * Text-only bridge mode keeps its two promises (PO, 2026-10-01).
 *
 * WHAT TEXT-ONLY MODE IS
 *   The user is in Google Meet with their REAL microphone and speakers. Meet hears their real voice;
 *   WarpTalk still transcribes and translates, but synthesizes no dub of them for the far side and
 *   plays nothing into a cable. The mode is per participant and the server owns it (backend #509:
 *   claim `audioMode`, PUT .../bridge/audio-mode, participant `isBridgeTextOnly`).
 *
 * THE TWO PROMISES, AND HOW EACH ONE WOULD QUIETLY BREAK
 *
 *   1. NO OUTBOUND CABLE IN TEXT MODE. The main window plays the user's outbound leg (the dub, or
 *      the raw mic before a dub exists) into VB-CABLE through FilteredRoomAudio's
 *      `bridgeOutboundDeviceId`. If the session hands it the device directly again — the way it did
 *      before this mode existed — a text-mode user whose Meet still points at the cable is heard
 *      twice, and one whose Meet does not gets nothing at all while the routing looks healthy.
 *      So the session must decide that prop through `bridgeOutboundSinkDeviceId` (null in text
 *      mode), and the loopback capture must ask the desktop for "text-only"
 *      (`bridgeLoopbackCaptureMode`), the one request it starts without the cable.
 *
 *   2. NO TEXT → VOICE WHILE LIVE. The user is speaking into Meet with their real mic; switching the
 *      dub on mid-meeting would put a second copy of every sentence into the call. The server
 *      refuses it (409 BRIDGE_AUDIO_MODE_LOCKED), and the client must not even ask: the session
 *      checks `bridgeAudioModeChange` before calling the server, and the popup's chooser greys the
 *      option out through `canChooseBridgeAudioMode`. The popup never calls the endpoint itself —
 *      only the main window does, so its routing and the server cannot disagree.
 *
 *   And the claim never sends "voice": a reload's claim would undo a text pick made before Start.
 *   It goes through `claimAudioModeFor`, which only ever answers "text" or nothing.
 *
 * Comments are stripped first — this header and the files' own explanations name the forbidden
 * shapes.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "./lib/strip-comments.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  const full = join(root, relativePath);
  if (!existsSync(full)) {
    failures.push(`${relativePath} is missing — was it moved?`);
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
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

function name(file) {
  return relative(root, file).split("\\").join("/");
}

// ── 1. no outbound cable in text mode ────────────────────────────────────────

const lib = read("src/lib/meeting/bridge-audio-mode.ts");
if (!/export function bridgeOutboundSinkDeviceId\b[\s\S]*?audioMode === "text"\) return null/.test(lib)) {
  failures.push(
    "bridge-audio-mode.ts: bridgeOutboundSinkDeviceId no longer returns null in text mode — the main "
      + "window would play into the cable for a user whose Meet hears their real mic.",
  );
}
if (!/export function bridgeLoopbackCaptureMode\b[\s\S]*?"text-only"/.test(lib)) {
  failures.push('bridge-audio-mode.ts: bridgeLoopbackCaptureMode no longer asks the desktop for "text-only".');
}

const session = read("src/components/rooms/live/persistent-meeting-session.tsx");
const outboundProps = [...session.matchAll(/bridgeOutboundDeviceId=\{([\s\S]*?)\}\s*\n/g)].map((match) => match[1]);
if (outboundProps.length === 0) {
  failures.push("persistent-meeting-session.tsx no longer passes bridgeOutboundDeviceId — was FilteredRoomAudio moved?");
}
for (const value of outboundProps) {
  if (!/^\s*bridgeOutboundSinkDeviceId\(/.test(value)) {
    failures.push(
      "persistent-meeting-session.tsx decides FilteredRoomAudio's bridgeOutboundDeviceId without "
        + "bridgeOutboundSinkDeviceId — text mode would route into the cable again.",
    );
  }
}
if (!/bridgeOutboundSinkDeviceId\(\{[\s\S]{0,200}audioMode:\s*bridgeAudioMode/.test(session)) {
  failures.push("persistent-meeting-session.tsx: bridgeOutboundSinkDeviceId is not given the user's bridgeAudioMode.");
}
if (!/openLoopbackInboundSource\(\{[\s\S]{0,600}mode:\s*bridgeLoopbackCaptureMode\(/.test(session)) {
  failures.push(
    "persistent-meeting-session.tsx starts the loopback capture without bridgeLoopbackCaptureMode — "
      + "a text-mode user without VB-CABLE would be refused (B2) and hear nothing of the far side.",
  );
}
if (!/canCaptureBrowserLoopback\([^)]*\{\s*textOnly:/.test(session)) {
  failures.push(
    "persistent-meeting-session.tsx asks canCaptureBrowserLoopback without the text-only flag — "
      + "loopback would wait for a cable text mode does not need.",
  );
}

// ── 2. no text → voice while live ────────────────────────────────────────────

if (!/bridgeAudioModeChange\(\{[\s\S]{0,300}translationActive:\s*translationStarted[\s\S]{0,400}setBridgeAudioMode\(/.test(session)) {
  failures.push(
    "persistent-meeting-session.tsx calls setBridgeAudioMode without first checking "
      + "bridgeAudioModeChange against translationStarted (text → voice while live).",
  );
}
if (!/BRIDGE_AUDIO_MODE_LOCKED/.test(lib) || !/bridgeAudioModeFailure\(/.test(session)) {
  failures.push(
    "the session no longer reads 409 BRIDGE_AUDIO_MODE_LOCKED as 'this user is text-only' "
      + "(bridgeAudioModeFailure).",
  );
}

const widgetFiles = filesUnder("src/components/rooms/bridge/widget");
for (const file of widgetFiles) {
  const source = stripComments(readFileSync(file, "utf8"));
  if (/setBridgeAudioMode\(|translationRooms\.bridgeAudioMode/.test(source)) {
    failures.push(
      `${name(file)} switches the audio mode itself. The popup relays \`set-audio-mode\`; only the main `
        + "window calls the server, so its routing and the server cannot disagree.",
    );
  }
}
const choice = read("src/components/rooms/bridge/widget/audio-mode-choice.tsx");
if (!/canChooseBridgeAudioMode\(\{[\s\S]{0,200}translationActive:\s*translationStarted/.test(choice)) {
  failures.push(
    "audio-mode-choice.tsx no longer gates the chooser with canChooseBridgeAudioMode on "
      + "translationStarted — the popup would offer text → voice while live.",
  );
}
if (!/relay\.setAudioMode\(/.test(choice)) {
  failures.push("audio-mode-choice.tsx no longer sends the switch through the relay.");
}

// The endpoint has one caller: the service, called by the session.
for (const file of [...filesUnder("src/components"), ...filesUnder("src/hooks"), ...filesUnder("src/app")]) {
  if (/translationRooms\.bridgeAudioMode\b/.test(stripComments(readFileSync(file, "utf8")))) {
    failures.push(`${name(file)} calls the audio-mode endpoint directly. Go through translationRoomService.setBridgeAudioMode.`);
  }
}

// ── the claim never sends "voice" ────────────────────────────────────────────

const autoRoom = read("src/hooks/use-bridge-auto-room.ts");
if (!/claimAudioModeFor\(/.test(autoRoom)) {
  failures.push("use-bridge-auto-room.ts no longer decides the claim's audioMode with claimAudioModeFor.");
}
if (/audioMode:\s*["']voice["']/.test(autoRoom)) {
  failures.push(
    'use-bridge-auto-room.ts sends audioMode "voice" on the claim — a reload would undo a text pick '
      + "made before Start.",
  );
}
if (!/claimAudioModeFor[\s\S]*?=== "text" \? "text" : undefined/.test(lib)) {
  failures.push('bridge-audio-mode.ts: claimAudioModeFor may now answer something other than "text" or nothing.');
}

if (failures.length) {
  console.error(`FAIL bridge text-only contract:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}

console.log(
  "PASS text-only bridge: nothing is routed into the cable in text mode, the loopback asks for "
    + `"text-only", and text → voice is never asked for while translation runs (${widgetFiles.length} popup files checked)`,
);
