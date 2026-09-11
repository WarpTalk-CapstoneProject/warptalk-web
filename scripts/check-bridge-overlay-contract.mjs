#!/usr/bin/env node
/**
 * The desktop bridge UI must stay reachable.
 *
 * WHAT HAPPENED, TWICE
 *
 *   WT-577. Four pieces of a floating transcript overlay shipped to production: the page, the
 *   Electron window, the IPC handler and the preload method. The fifth — anything in the web app
 *   calling it — did not. `grep openTranscriptWindow src/` returned nothing for weeks while three
 *   repos' worth of code sat behind it, and nothing anywhere failed.
 *
 *   WT-578. `BridgeSetupWizard` was written in full, 250 lines, with a live tone probe. Its only
 *   caller was `/dev/bridge-setup-preview`. A user in a real bridge room whose virtual microphone
 *   was missing got a four-second toast and no way to fix it.
 *
 * THE RULE THIS ENCODES
 *
 *   A capability is not shipped when it is written. It is shipped when something a user can reach
 *   calls it. So this checks CALLERS, not existence — the same shape as
 *   check-desktop-download-contract.mjs, for the same reason.
 *
 *   Assertion 1 generalises it: every helper exported from lib/desktop/bridge.ts must have a
 *   caller outside that file and outside its own tests. A method can be declared, typed, wrapped
 *   in a guard, unit-tested, and reach nobody — which is exactly the state WT-577 found.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { stripComments } from "./lib/strip-comments.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  const full = join(root, relativePath);
  if (!existsSync(full)) return null;
  return readFileSync(full, "utf8");
}

/**
 * The file with its import statements removed.
 *
 * An import is not a caller. Without this, deleting the last real use of a bridge helper while
 * leaving the import behind — which is what an editor does when you delete a line, and what the
 * linter then reports as a WARNING rather than an error — would still satisfy assertion 1. That is
 * the exact shape of the bug being guarded against: a symbol that is present everywhere and
 * invoked nowhere.
 */
function withoutImports(source) {
  const lines = source.split("\n");
  const kept = [];
  let inImport = false;

  for (const line of lines) {
    if (inImport) {
      // A multi-line import ends at the line carrying its module specifier.
      if (/\bfrom\s*["']/.test(line) || /^\s*["']/.test(line)) inImport = false;
      continue;
    }
    if (/^\s*import\b/.test(line)) {
      // A single-line import is done on this line; anything else opens a block.
      if (!/\bfrom\s*["']/.test(line) && !/^\s*import\s*["']/.test(line)) inImport = true;
      continue;
    }
    kept.push(line);
  }

  return kept.join("\n");
}

/** Every .ts/.tsx under src/, as repo-relative POSIX paths. */
function sourceFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") sourceFiles(full, found);
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(full.slice(root.length + 1).split("\\").join("/"));
    }
  }
  return found;
}

const BRIDGE = "src/lib/desktop/bridge.ts";
const bridge = read(BRIDGE);
const allSources = existsSync(join(root, "src")) ? sourceFiles(join(root, "src")) : [];

/**
 * 1. Every bridge helper has a caller a user can reach.
 *
 * Tests are excluded deliberately. A helper whose only caller is its own test is the precise
 * failure this script exists for: it proves the code works and proves nothing about whether
 * anybody can get to it.
 */
if (!bridge) {
  failures.push(`${BRIDGE} is missing. It is the single place the desktop preload surface is
    declared; without it every call site goes back to writing its own inline window.warptalk shape.`);
} else {
  const helpers = [...bridge.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]);

  if (helpers.length === 0) {
    failures.push(`No exported functions found in ${BRIDGE}. If the file was restructured, update
      this check — do not leave it matching nothing and passing.`);
  }

  const callerFiles = allSources.filter(
    (file) => file !== BRIDGE && !file.includes("__tests__") && !file.endsWith(".test.ts"),
  );
  const callerSource = callerFiles
    .map((file) => withoutImports(stripComments(read(file) ?? "")))
    .join("\n");

  for (const helper of helpers) {
    if (!new RegExp(`\\b${helper}\\b`).test(callerSource)) {
      failures.push(
        `${BRIDGE} exports ${helper}() and nothing outside it calls it. Either wire it to a surface `
          + `a user can reach, or delete it — a bridge method with no caller is the WT-577 defect, `
          + `where the page, the Electron window, the IPC handler and the preload method all `
          + `shipped and the overlay still could not be opened.`,
      );
    }
  }
}

/**
 * 2. The overlay page renders the controls WT-525 asked for.
 *
 * The page shipped with the transcript alone, which is one of the four things the ticket named.
 * The other three are what stop the overlay being a read-only window you still have to leave in
 * order to do anything.
 */
const OVERLAY_PAGE = "src/app/desktop-transcript/[roomId]/page.tsx";
const CONTROLS = "src/components/rooms/bridge/bridge-overlay-controls.tsx";
const overlayPage = read(OVERLAY_PAGE);
const controls = read(CONTROLS);

// Every symbol test below is word-bounded. A bare substring test passes for a RENAMED symbol —
// `BridgeSetupWizardX` contains `BridgeSetupWizard` — and a rename is how these references
// actually disappear in practice. Nobody deletes them; somebody refactors around them.
if (!overlayPage) {
  failures.push(`${OVERLAY_PAGE} is missing. It is what the desktop app loads into the always-on-top
    window; without it openTranscriptWindow opens a 404 over the user's meeting.`);
} else if (!/\bBridgeOverlayControls\b/.test(overlayPage)) {
  failures.push(
    `${OVERLAY_PAGE} no longer renders BridgeOverlayControls. WT-525 asks the overlay for Start/Stop `
      + `Translation, a voice picker and a voice clone toggle beside the transcript; without them a `
      + `user watching Google Meet has to go and find the WarpTalk window, which is the tab-switch `
      + `the overlay exists to remove.`,
  );
}

if (!controls) {
  failures.push(`${CONTROLS} is missing; ${OVERLAY_PAGE} renders it.`);
} else {
  // Named by the mutation each control fires, not by its label: a renamed button is a copy change,
  // whereas a control that stops calling its mutation is the control going away.
  for (const [hook, what] of [
    ["useResumeTranslationRoom", "Start Translation (/resume is the endpoint that opens a session)"],
    ["useStopTranslation", "Stop Translation"],
    ["useSetDubVoice", "the voice picker"],
    ["useSetVoiceCloneConsent", "the voice clone toggle"],
  ]) {
    if (!new RegExp(`\\b${hook}\\b`).test(controls)) {
      failures.push(
        `${CONTROLS} no longer uses ${hook} — ${what} is one of the four controls WT-525 requires on `
          + `the overlay.`,
      );
    }
  }

  // The dub voice lives in AuthService, which knows nothing about rooms. The AI pipeline learns it
  // from an AUDIO_ROUTES_UPDATED payload, so without the refresh the change is correct everywhere
  // except the meeting the user is standing in — which is the only place this window is used.
  if (!/\buseRefreshDubVoice\b/.test(controls)) {
    failures.push(
      `${CONTROLS} sets the dub voice without calling useRefreshDubVoice. The setting would be saved `
        + `and the meeting would keep speaking in the old voice until the user rejoined.`,
    );
  }
}

/**
 * 3. The device setup wizard has a caller in the product.
 *
 * WT-578 exactly: it existed, it worked, and the only route to it was a dev preview page.
 */
const WIZARD = "src/components/rooms/bridge/bridge-setup-wizard.tsx";
if (!read(WIZARD)) {
  failures.push(`${WIZARD} is missing. It is the only screen that tells a user which virtual audio
    devices to install and proves the ones they have actually carry sound.`);
} else {
  const productCallers = allSources.filter(
    (file) =>
      file !== WIZARD
      && !file.includes("__tests__")
      && !file.startsWith("src/app/dev/")
      && /\bBridgeSetupWizard\b/.test(read(file) ?? ""),
  );

  if (productCallers.length === 0) {
    failures.push(
      `BridgeSetupWizard is imported only by the dev preview page. That is the WT-578 defect: in a `
        + `real EXTERNAL_BRIDGE room a user with no virtual microphone got one toast.error and no `
        + `way to act on it, while the screen that fixes it sat behind a URL only a developer knew.`,
    );
  }
}

/**
 * 4. The room offers a way back into the wizard.
 *
 * Opening it once when a device is missing is not enough. Devices are taken away mid-call by
 * reboots and by other apps grabbing the driver, and a user who dismissed the dialog has no second
 * chance unless something on the widget offers one.
 */
const WIDGET = "src/components/rooms/live/external-bridge-widget.tsx";
const widget = read(WIDGET);
if (!widget) {
  failures.push(`${WIDGET} is missing; it is the whole WarpTalk UI during an external-bridge call.`);
} else if (!/\bonOpenDeviceSetup\b/.test(widget)) {
  failures.push(
    `${WIDGET} has no onOpenDeviceSetup. The wizard would then be reachable only at the moment the `
      + `device check first fails — and a device that drops mid-meeting, which is the common case, `
      + `would leave the user with a widget reporting "not ready" and nothing to press.`,
  );
}

/**
 * 5. No hardcoded dark theme on the desktop windows.
 *
 * These are the only WarpTalk windows sitting among the user's own, and both were written against
 * a dark mock: `bg-[#0b0b0c] text-white` on <main> overrode the theme the root layout had already
 * applied, so a light-theme user got one black window and no way to change it.
 */
for (const [label, source] of [
  [OVERLAY_PAGE, overlayPage],
  [WIZARD, read(WIZARD)],
  ["src/app/desktop-bridge-offer/page.tsx", read("src/app/desktop-bridge-offer/page.tsx")],
]) {
  if (!source) continue;
  const code = stripComments(source);
  if (/bg-\[#0b0b0c\]|text-white\/\d|border-white\/\d/.test(code)) {
    failures.push(
      `${label} hardcodes a dark-theme colour. Use the semantic tokens (bg-canvas, text-ink, `
        + `text-ink-muted, border-border) so the window follows the theme the user chose — these `
        + `windows float among their own, and a black one they cannot change is the complaint.`,
    );
  }
}

/**
 * 6. No `-danger` colour utilities, anywhere in the bridge UI.
 *
 * Tailwind v4 generates a colour utility only for a token registered in @theme, and --color-danger
 * is not one. `text-danger` therefore compiles to nothing: the class is present in the markup, the
 * element renders, and the text comes out in ordinary body colour. It is the same trap that made
 * every destructive button in the app invisible before --destructive was registered, and the two
 * places it survived were both on these windows — where the text it silenced was the error telling
 * the user why their meeting could not start.
 */
for (const [label, source] of [
  [OVERLAY_PAGE, overlayPage],
  [CONTROLS, controls],
  [WIZARD, read(WIZARD)],
  [WIDGET, widget],
  ["src/app/desktop-bridge-offer/page.tsx", read("src/app/desktop-bridge-offer/page.tsx")],
]) {
  if (!source) continue;
  if (/\b(?:text|bg|border)-danger\b/.test(stripComments(source))) {
    failures.push(
      `${label} uses a \`-danger\` colour utility. --color-danger is not registered in @theme, so `
        + `that class compiles to nothing and the text renders in body colour. Use -destructive.`,
    );
  }
}

/**
 * The text of the first `name(...)` call in `source`, parentheses balanced, with where it sits.
 *
 * Strings are not skipped. That is enough for the argument lists read here, none of which carries
 * a parenthesis inside a string literal; a check that one day does would fail loudly, not pass.
 */
function callSpan(source, name) {
  const match = new RegExp(`\\b${name}\\(`).exec(source);
  if (!match) return null;
  let depth = 0;
  for (let index = match.index + match[0].length - 1; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    else if (source[index] === ")") {
      depth -= 1;
      if (depth === 0) {
        return { start: match.index, end: index + 1, text: source.slice(match.index, index + 1) };
      }
    }
  }
  return null;
}

/**
 * 7. Start asks the main window to carry the room before it opens a translation session.
 *
 * WHAT HAPPENED: the popup's Start called /start and /resume directly. Both are server calls and
 * both succeeded, so the popup showed Stop and the sessions list said ACTIVE - while the pipeline,
 * which only the main window's PersistentMeetingSession runs, never mounted, because that mounts
 * for the main window's own active room and nothing had told it about this one. A scheduled room
 * whose popup the trigger raised translated nothing, with every surface saying it was. Flow 2 had
 * the relay all along (activateBridgeRoom); flow 1 simply never called it.
 *
 * So both ends are checked where they are CALLED. The order inside startBridgeTranslation is held
 * by its unit test; what a test of the helper cannot see is a popup that stops going through it.
 */
if (controls) {
  const code = withoutImports(stripComments(controls));
  const start = callSpan(code, "startBridgeTranslation");
  if (!start) {
    failures.push(
      `${CONTROLS} no longer starts translation through startBridgeTranslation. That is the only `
        + `path that asks the main window to carry the room first; without it the popup opens a `
        + `session that no LiveKit connection, dub or bridge leg is feeding.`,
    );
  } else {
    if (!/\bactivateBridgeRoom\b/.test(start.text)) {
      failures.push(
        `${CONTROLS} calls startBridgeTranslation without activateBridgeRoom as its activate step. `
          + `The room would be marked translating in a main window that never mounted it.`,
      );
    }

    // Any /resume fired outside the sequence is the old bug by another route.
    const resumeName = /const\s+(\w+)\s*=\s*useResumeTranslationRoom\(/.exec(code)?.[1];
    if (resumeName) {
      const stray = [...code.matchAll(new RegExp(`\\b${resumeName}\\.mutate(?:Async)?\\(`, "g"))]
        .some((use) => use.index < start.start || use.index >= start.end);
      if (stray) {
        failures.push(
          `${CONTROLS} calls ${resumeName}.mutate outside startBridgeTranslation. That opens a `
            + `translation session without first asking the main window to carry the room.`,
        );
      }
    }
  }
}

const LAYOUT = "src/app/(app)/layout.tsx";
const layout = read(LAYOUT);
if (!layout) {
  failures.push(`${LAYOUT} is missing; it is the main window's end of the activation relay.`);
} else {
  const relay = callSpan(withoutImports(stripComments(layout)), "onBridgeRoomActivated");
  if (!relay || !/\bopenMeeting\(/.test(relay.text)) {
    failures.push(
      `${LAYOUT} no longer turns onBridgeRoomActivated into openMeeting. Both bridge popups - the `
        + `offer and the transcript's Start - would then ask a main window that does not answer, `
        + `and translation would run with nothing capturing or dubbing it.`,
    );
  }
}

if (failures.length > 0) {
  console.error("FAIL desktop bridge overlay contract\n");
  for (const failure of failures) console.error(`  - ${failure.replace(/\s+/g, " ")}\n`);
  process.exit(1);
}

console.log(
  "PASS every desktop bridge helper has a caller, the overlay carries its four controls, its Start "
    + "activates the room in the main window, and the setup wizard is reachable from a real room",
);
