#!/usr/bin/env node
/**
 * The Meet widget changes the meeting only through the main window. WT-525.
 *
 * WHY THIS EXISTS
 *   The widget (the desktop popup over Google Meet, src/components/rooms/bridge/widget/) has its
 *   own hub connection, and every shortcut through it looks like it works:
 *
 *   - `JoinTranslationRoom` from the popup ForceDisconnects the main window (BR-159-014: one
 *     connection per user per room) — the popup would throw the user out of the meeting it floats
 *     over, and closing it would delete their languages from Redis.
 *   - `SetSpeakLanguage` / `SetListenLanguage` from the popup reach the gateway and are then
 *     silently undone: the main window re-sends the language it holds on every hub reconnect.
 *     The language pill therefore RELAYS a pick to the main window (lib/meeting/bridge-widget-relay)
 *     and disables itself when no main window answers. Falling back to the hub "just in case" is
 *     the change this check exists to stop.
 *
 *   And two rules from the settings flyout's design that a copy-paste from the meeting's menu
 *   would break without anyone noticing:
 *
 *   - no "Noise suppression" row: in a bridge room nobody hears the raw mic, so Krisp only affects
 *     recognition and duplicates "Mic noise filter";
 *   - picking a listen voice never revokes the voice-clone consent. The meeting bar's
 *     `selectProviderVoice` does `onChangeVoiceCloneConsent(false)`, a known bug that must not be
 *     carried into the widget's voice panel.
 *
 *   Finally, the channel name is built in one place: a second spelling of
 *   `warptalk:bridge-widget:` is two windows that never hear each other, and nothing fails.
 *
 * Comments are stripped first — the explanations above and in the files name the forbidden calls.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "./lib/strip-comments.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

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

function code(file) {
  return stripComments(readFileSync(file, "utf8"));
}

function name(file) {
  return relative(root, file).split("\\").join("/");
}

const widgetFiles = [
  ...filesUnder("src/components/rooms/bridge/widget"),
  ...filesUnder("src/app/desktop-transcript"),
];

if (widgetFiles.length === 0) {
  failures.push("found no widget sources under src/components/rooms/bridge/widget — was it moved?");
}

// 1. The popup never joins the room.
for (const file of widgetFiles) {
  if (/JoinTranslationRoom/.test(code(file))) {
    failures.push(`${name(file)} calls JoinTranslationRoom — that ForceDisconnects the main window.`);
  }
}

// 2. The language pill relays; it does not invoke the hub.
const pillPath = join(root, "src/components/rooms/bridge/widget/dock-language-pill.tsx");
if (!existsSync(pillPath)) {
  failures.push("src/components/rooms/bridge/widget/dock-language-pill.tsx is missing.");
} else {
  const pill = code(pillPath);
  if (/Set(Speak|Listen)Language|\bhub\b[\s\S]{0,40}\.invoke\(/.test(pill)) {
    failures.push(
      "dock-language-pill.tsx talks to the hub. A pick must go through the relay: the main window "
        + "re-sends its own language on every reconnect and would undo it.",
    );
  }
  if (!/useBridgeWidgetRelayClient\(/.test(pill) || !/pickLanguage\(/.test(pill)) {
    failures.push("dock-language-pill.tsx no longer sends its pick through useBridgeWidgetRelayClient.");
  }
}

// 3. The settings flyout: no Krisp row, no consent revoked by a voice pick.
const flyoutFiles = widgetFiles.filter((file) => /settings/.test(name(file)));
for (const file of flyoutFiles) {
  const source = code(file);
  if (/["'`>]\s*Noise suppression\s*["'`<]/.test(source)) {
    failures.push(
      `${name(file)} renders a "Noise suppression" row. In a bridge room it only duplicates Mic noise filter.`,
    );
  }
  if (/onChangeVoiceCloneConsent\??\.?\(\s*false\s*\)/.test(source)) {
    failures.push(
      `${name(file)} revokes voice-clone consent (onChangeVoiceCloneConsent(false)) — picking a voice to `
        + "HEAR is not a decision about cloning your own.",
    );
  }
}

// 4. One spelling of the channel name.
const relayLib = "src/lib/meeting/bridge-widget-relay.ts";
if (!existsSync(join(root, relayLib))) {
  failures.push(`${relayLib} is missing.`);
}
for (const file of [...filesUnder("src/components"), ...filesUnder("src/hooks"), ...filesUnder("src/app"), ...filesUnder("src/lib")]) {
  if (name(file) === relayLib) continue;
  if (/warptalk:bridge-widget:/.test(code(file))) {
    failures.push(
      `${name(file)} spells the relay channel name itself. Use openBridgeWidgetRelay / `
        + "bridgeWidgetRelayChannelName so both windows open the same channel.",
    );
  }
}

if (failures.length) {
  console.error(`FAIL bridge widget relay contract:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}

console.log(
  `PASS the Meet widget (${widgetFiles.length} files) never joins the room, relays its language `
    + "pick to the main window, and keeps the settings flyout's two rules",
);
