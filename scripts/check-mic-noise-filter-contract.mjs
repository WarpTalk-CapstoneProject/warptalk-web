#!/usr/bin/env node
/**
 * The mic noise filter is SELF-SERVICE, and it is not the Krisp toggle.
 *
 * WHY THIS EXISTS
 *   WT-427 built a per-room denoising mode in stt_worker and it never once took effect, because no
 *   repo ever wrote the key it read. The write half now exists. These are the two edits that would
 *   quietly undo it again, and both are the kind a careful person makes on purpose:
 *
 *   1. GATING IT ON THE HOST. In persistent-meeting-session.tsx the line directly above
 *      onChangeNoiseReductionMode is onChangeFlashMode, which IS `isRoomHost ? ... : undefined` —
 *      correctly, because flash mode changes how everybody in the room is transcribed. Copying that
 *      gate one line down looks like consistency and is a bug: this control changes how ONE
 *      person's own microphone is handled, so gating it means a guest in a noisy room has to ask
 *      permission to be understood. The server agrees — IMicrophoneNoiseReductionService requires
 *      membership, never hosting.
 *
 *   2. MERGING IT INTO "NOISE SUPPRESSION". The settings menu has two adjacent controls that both
 *      sound like noise. The row above filters the microphone other people HEAR (Krisp,
 *      client-side, can be unavailable — see noise-suppression-failure.ts). This one filters what
 *      the transcriber hears. Someone tidying the menu will eventually see a duplicate and remove
 *      one; that would take the only reachable control for provider-side denoising with it.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SESSION = "src/components/rooms/live/persistent-meeting-session.tsx";
const BAR = "src/components/rooms/live/meeting-control-bar.tsx";

const failures = [];

const session = readFileSync(join(root, SESSION), "utf8");

// The whole prop expression, however it is formatted.
const handlerMatch = session.match(/onChangeNoiseReductionMode=\{([\s\S]{0,240}?)\}\s*\n/);

if (!handlerMatch) {
  failures.push(
    `${SESSION}: onChangeNoiseReductionMode is not passed to the control bar. Without it every ` +
      "participant sees a read-only control, which is the state WT-427 was already in.",
  );
} else {
  const expression = handlerMatch[1];
  if (/isRoomHost|isHost|isWorkspaceAdmin/.test(expression)) {
    failures.push(
      `${SESSION}: onChangeNoiseReductionMode is gated on a host check:\n       ` +
        `${expression.trim().replace(/\s+/g, " ")}\n     ` +
        "This control only changes the caller's OWN microphone. The host gate belongs to " +
        "onChangeFlashMode on the line above it, not to this one.",
    );
  }
}

const bar = readFileSync(join(root, BAR), "utf8");

if (!/setSettingsSection\("microphone"\)/.test(bar)) {
  failures.push(
    `${BAR}: nothing opens the "microphone" settings section, so the mic noise filter cannot be ` +
      "reached. A control nobody can open is what this whole change exists to end.",
  );
}

if (!/onToggleNoiseSuppression/.test(bar)) {
  failures.push(
    `${BAR}: the Krisp noise-suppression toggle is gone. These are two different layers with two ` +
      "different audiences; the mic noise filter does not replace it.",
  );
}

// Both must be visible in the menu, and worded so they cannot be read as the same setting twice.
if (!/label="Mic noise filter"/.test(bar)) {
  failures.push(
    `${BAR}: the mic noise filter row was renamed. It has to stay distinguishable from the ` +
      '"Noise suppression" row beside it — that is the only thing keeping them from being ' +
      "mistaken for a duplicate and merged.",
  );
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log("PASS the mic noise filter is self-service and distinct from Krisp");
