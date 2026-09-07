#!/usr/bin/env node
/**
 * The browser's own denoiser is configured on the MICROPHONE, never on Krisp's output.
 *
 * livekit-client's LocalTrack exposes
 *   `get mediaStreamTrack() { return this.processor?.processedTrack ?? this._mediaStreamTrack }`
 * so the moment a processor is attached, that property stops being the capture device and
 * becomes the processor's output — a WebAudio destination track. A WebAudio track supports none
 * of `echoCancellation` / `noiseSuppression` / `voiceIsolation` / `autoGainControl` /
 * `channelCount`, and `applyConstraints` on it rejects with
 * `OverconstrainedError: Cannot satisfy constraints`.
 *
 * In production that rejection landed inside the try that wraps attaching Krisp, so it was
 * reported as "Krisp noise suppression failed to attach or enable" and rolled back — while Krisp
 * had in fact attached AND enabled. The toggle could not be turned on, for a reason that had
 * nothing to do with Krisp.
 *
 * The trap is that the previous fix caused it. Attaching Krisp FIRST — so the browser's denoiser
 * is only stood down once there is something to stand it down for — is correct and must stay;
 * it is what guarantees a failed attach cannot leave the microphone with no denoiser at all. But
 * it also guarantees a processor is in place by the time the constraints are applied, which is
 * exactly when the getter starts lying about which track it is.
 *
 * So both properties have to hold at once, and each one alone looks complete. Hence this file.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "src/hooks/use-track-processors.ts"), "utf8");

// Comments describe the bug in these words; reading them as code is how a check like this passes
// against the very thing it exists to catch.
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── the constraints never touch the getter ───────────────────────────────────

assert.doesNotMatch(
  code,
  /localAudioTrack\.mediaStreamTrack\.applyConstraints/,
  "Device constraints must never be applied through `localAudioTrack.mediaStreamTrack`: with a processor attached that getter returns Krisp's WebAudio output, which supports none of them and throws OverconstrainedError.",
);

assert.match(
  code,
  /async function setBrowserSuppression\(\s*captureTrack: MediaStreamTrack,\s*enabled: boolean,?\s*\)/,
  "setBrowserSuppression must be handed the capture track explicitly. Reading it inside the function is what made it depend on whether a processor happened to be attached at the time.",
);

// ── the capture track is read with nothing attached ──────────────────────────

const capture = code.indexOf("const captureTrack = localAudioTrack.mediaStreamTrack;");
assert.ok(capture !== -1, "The capture track must be resolved once, from the local audio track.");

const detach = code.indexOf("await localAudioTrack.stopProcessor();");
assert.ok(
  detach !== -1 && detach < capture,
  "Any attached processor must be stopped BEFORE the capture track is read — otherwise the getter hands back the previous run's processor output and the whole fix is undone.",
);

// ── the ordering that must not be traded away to fix the above ───────────────

// Krisp is proven running before the browser's denoiser is surrendered. Reversing this is the
// older bug: a failed attach left the microphone with neither denoiser, which is strictly worse
// than never having tried.
const enable = code.indexOf("await krisp.setEnabled(true);");
const standDown = code.indexOf("await setBrowserSuppression(captureTrack, false);");
assert.ok(enable !== -1 && standDown !== -1, "Both the enable and the stand-down must be present.");
assert.ok(
  enable < standDown,
  "Krisp must be enabled and verified before the browser's own suppression is switched off.",
);

console.log("Krisp capture-track contract: PASS (constraints on the mic, processor detached first, order kept)");
