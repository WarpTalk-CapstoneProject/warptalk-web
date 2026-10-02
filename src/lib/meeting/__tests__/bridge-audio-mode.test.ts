/**
 * Text-only bridge mode (PO, 2026-10-01): which mode a machine starts in, which switches are
 * allowed, and the two places the main window must stop touching the cable.
 */

import test from "node:test";
import assert from "node:assert/strict";

import type { VirtualAudioStatus } from "../../desktop/bridge.ts";
import {
  bridgeAudioModeChange,
  bridgeAudioModeFailure,
  bridgeLoopbackCaptureMode,
  bridgeMeetMicMismatch,
  bridgeModeSupport,
  bridgeOutboundSinkDeviceId,
  canChooseBridgeAudioMode,
  claimAudioModeFor,
  missingCableIsAProblem,
  parseBridgeAudioMode,
  preferredBridgeAudioMode,
  resolveBridgeAudioMode,
} from "../bridge-audio-mode.ts";

function windows(overrides: Partial<VirtualAudioStatus> = {}): VirtualAudioStatus {
  return {
    platform: "win32",
    supported: true,
    ready: false,
    foreignDrivers: [],
    devices: [],
    ...overrides,
  };
}

const cable = {
  leg: "outbound" as const,
  driverBundle: "VB-CABLE",
  deviceName: "CABLE Output (VB-Audio Virtual Cable)",
  installed: true,
};

function modes(textPossible: boolean, cableInstalled: boolean) {
  return {
    textOnly: { possible: textPossible },
    voice: { possible: cableInstalled, cableInstalled },
  };
}

test("parse mirrors the server: voice/text in any case, anything else is nothing", () => {
  assert.equal(parseBridgeAudioMode("TEXT"), "text");
  assert.equal(parseBridgeAudioMode(" voice "), "voice");
  assert.equal(parseBridgeAudioMode("text-only"), null);
  assert.equal(parseBridgeAudioMode(undefined), null);
});

test("support: the desktop's bridgeModes when reported, the cable alone on an older build", () => {
  assert.equal(bridgeModeSupport(null), null, "no reading is not 'neither works'");
  assert.deepEqual(bridgeModeSupport(windows({ devices: [cable] })), {
    voice: true,
    text: false,
    cableInstalled: true,
    reported: false,
  });
  assert.deepEqual(bridgeModeSupport(windows({ bridgeModes: modes(true, false) })), {
    voice: false,
    text: true,
    cableInstalled: false,
    reported: true,
  });
});

test("default: voice with the cable, text without it where text works, voice otherwise", () => {
  assert.equal(preferredBridgeAudioMode(bridgeModeSupport(windows({ bridgeModes: modes(true, true) }))), "voice");
  assert.equal(preferredBridgeAudioMode(bridgeModeSupport(windows({ bridgeModes: modes(true, false) }))), "text");
  assert.equal(preferredBridgeAudioMode(bridgeModeSupport(windows({ bridgeModes: modes(false, false) }))), "voice");
  assert.equal(preferredBridgeAudioMode(null), "voice");
});

test("the claim sends only 'text', and only where voice cannot run", () => {
  assert.equal(claimAudioModeFor(windows({ bridgeModes: modes(true, false) })), "text");
  // Never "voice": a reload's claim would undo a text pick made before Start.
  assert.equal(claimAudioModeFor(windows({ bridgeModes: modes(true, true) })), undefined);
  assert.equal(claimAudioModeFor(windows({ devices: [cable] })), undefined);
  assert.equal(claimAudioModeFor(null), undefined);
});

test("resolution: what the server told this window, then the participant row, then voice", () => {
  assert.equal(resolveBridgeAudioMode({ known: "voice", isBridgeTextOnly: true }), "voice");
  assert.equal(resolveBridgeAudioMode({ isBridgeTextOnly: true }), "text");
  assert.equal(resolveBridgeAudioMode({ isBridgeTextOnly: false }), "voice");
  assert.equal(resolveBridgeAudioMode({}), "voice", "a server before #509 means voice");
});

test("one way only while live: voice → text always, text → voice only before Start / after Stop", () => {
  assert.equal(bridgeAudioModeChange({ current: "voice", next: "text", translationActive: true }), "allowed");
  assert.equal(bridgeAudioModeChange({ current: "text", next: "voice", translationActive: true }), "locked");
  assert.equal(bridgeAudioModeChange({ current: "text", next: "voice", translationActive: false }), "allowed");
  assert.equal(bridgeAudioModeChange({ current: "text", next: "text", translationActive: true }), "noop");
});

test("the chooser offers a mode only where it can run and is not locked", () => {
  const noCable = bridgeModeSupport(windows({ bridgeModes: modes(true, false) }));
  assert.equal(
    canChooseBridgeAudioMode({ current: "text", next: "voice", translationActive: false, support: noCable }),
    false,
    "voice needs the cable",
  );
  const both = bridgeModeSupport(windows({ devices: [cable], bridgeModes: modes(true, true) }));
  assert.equal(
    canChooseBridgeAudioMode({ current: "text", next: "voice", translationActive: true, support: both }),
    false,
    "locked while translating",
  );
  assert.equal(
    canChooseBridgeAudioMode({ current: "voice", next: "text", translationActive: true, support: both }),
    true,
  );
  assert.equal(
    canChooseBridgeAudioMode({ current: "voice", next: "text", translationActive: false, support: null }),
    true,
    "no reading: let the server decide",
  );
});

test("a 409 BRIDGE_AUDIO_MODE_LOCKED means text stays; anything else is a plain refusal", () => {
  assert.equal(bridgeAudioModeFailure({ status: 409, code: "BRIDGE_AUDIO_MODE_LOCKED" }), "locked");
  assert.equal(bridgeAudioModeFailure({ status: 409, code: "INVALID_STATE" }), "refused");
  assert.equal(bridgeAudioModeFailure({ status: 403, code: "FORBIDDEN" }), "refused");
  assert.equal(bridgeAudioModeFailure({ status: null }), "refused");
});

test("text mode routes NOTHING into the cable, whatever is installed", () => {
  const base = { isBridgeRoom: true, isHost: true, deviceId: "cable-id" };
  assert.equal(bridgeOutboundSinkDeviceId({ ...base, audioMode: "voice" }), "cable-id");
  assert.equal(bridgeOutboundSinkDeviceId({ ...base, audioMode: "text" }), null);
  assert.equal(bridgeOutboundSinkDeviceId({ ...base, isBridgeRoom: false, audioMode: "voice" }), null);
  assert.equal(bridgeOutboundSinkDeviceId({ ...base, isHost: false, audioMode: "voice" }), null);
});

test("the loopback capture asks the desktop for text-only in text mode", () => {
  assert.equal(bridgeLoopbackCaptureMode("text"), "text-only");
  assert.equal(bridgeLoopbackCaptureMode("voice"), "voice");
});

test("a missing cable is a problem only for voice on a machine that would run voice", () => {
  const noCableText = bridgeModeSupport(windows({ bridgeModes: modes(true, false) }));
  assert.equal(missingCableIsAProblem({ audioMode: "text", support: noCableText }), false);
  assert.equal(missingCableIsAProblem({ audioMode: "voice", support: noCableText }), false, "about to be text");
  const oldBuild = bridgeModeSupport(windows());
  assert.equal(missingCableIsAProblem({ audioMode: "voice", support: oldBuild }), true);
});

test("the Meet mic notice: text on the cable, voice on the real mic; silence when unsure", () => {
  assert.equal(bridgeMeetMicMismatch({ audioMode: "text", meetMic: "cable" }), "text-on-cable");
  assert.equal(bridgeMeetMicMismatch({ audioMode: "voice", meetMic: "real" }), "voice-on-real");
  assert.equal(bridgeMeetMicMismatch({ audioMode: "text", meetMic: "real" }), null);
  assert.equal(bridgeMeetMicMismatch({ audioMode: "voice", meetMic: "cable" }), null);
  assert.equal(bridgeMeetMicMismatch({ audioMode: "voice", meetMic: "ambiguous" }), null);
  assert.equal(bridgeMeetMicMismatch({ audioMode: "text", meetMic: "unknown" }), null);
  assert.equal(bridgeMeetMicMismatch({ audioMode: null, meetMic: "cable" }), null);
});
