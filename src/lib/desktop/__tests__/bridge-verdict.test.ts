/**
 * The desktop's verdict is the answer; the web's own derivation runs only when a field is absent,
 * and the tone probe may only downgrade.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { VirtualAudioStatus } from "../bridge.ts";
import {
  bridgeDevicesReady,
  bridgeDevicesReadyWithProbe,
  bridgeInboundOptional,
  bridgeLoopbackCapable,
  bridgePlatformOf,
  probeDowngrades,
  readBridgeVerdict,
  type BridgeProbeEvidence,
} from "../bridge-verdict.ts";

const cable = {
  leg: "outbound" as const,
  driverBundle: "VB-CABLE",
  deviceName: "CABLE Output (VB-Audio Virtual Cable)",
  installed: true,
};

function status(overrides: Partial<VirtualAudioStatus> = {}): VirtualAudioStatus {
  return { platform: "win32", supported: true, ready: false, foreignDrivers: [], devices: [], ...overrides };
}

function modes(voicePossible: boolean, cableInstalled: boolean, textPossible = false) {
  return {
    textOnly: { possible: textPossible },
    voice: { possible: voicePossible, cableInstalled },
  };
}

const probeOk: BridgeProbeEvidence = {
  probes: [
    { present: true, carriesSignal: true },
    { present: false, carriesSignal: null, optional: true },
  ],
  ready: true,
  needsPermission: false,
};

test("platform comes from the desktop's status, never the user agent", () => {
  assert.equal(bridgePlatformOf(status()), "windows");
  assert.equal(bridgePlatformOf(status({ platform: "darwin" })), "macos");
  assert.equal(bridgePlatformOf(status({ platform: "linux" })), "other");
});

test("readBridgeVerdict: desktop fields win, fallbacks only where they are absent", () => {
  assert.equal(readBridgeVerdict(null), null);
  const reported = readBridgeVerdict(status({ ready: true, devices: [], bridgeModes: modes(true, true, true) }));
  assert.deepEqual(reported, {
    platform: "windows",
    ready: true,
    voicePossible: true,
    textOnlyPossible: true,
    // The desktop's cableInstalled, although the device list here is empty.
    cableInstalled: true,
    inboundOptional: true,
    reported: { modes: true, endpointLabels: false },
  });
  const old = readBridgeVerdict(status({ devices: [cable] }));
  assert.equal(old?.voicePossible, true, "older build: voice is 'the cable is there'");
  assert.equal(old?.textOnlyPossible, false, "older build: no text-only mode");
  assert.equal(old?.reported.modes, false);
});

test("inboundOptional: the desktop's endpointLabels, else the desktop's platform", () => {
  const labels = {
    outboundProviderId: "vbcable-free",
    outboundSink: "CABLE Input (VB-Audio Virtual Cable)",
    meetMicrophone: "CABLE Output (VB-Audio Virtual Cable)",
    inboundProviderId: "hifi-cable-free",
    inboundCapture: "Hi-Fi Cable Output",
    meetSpeaker: "Hi-Fi Cable Input",
    inboundOptional: false,
  };
  assert.equal(bridgeInboundOptional(status({ endpointLabels: labels })), false, "desktop wins");
  assert.equal(bridgeInboundOptional(status()), true);
  assert.equal(bridgeInboundOptional(status({ platform: "darwin" })), false);
});

test("loopback: textOnly.possible is the runtime verdict; voice adds the desktop's cableInstalled", () => {
  assert.equal(bridgeLoopbackCapable(null), false);
  assert.equal(bridgeLoopbackCapable(status({ bridgeModes: modes(true, true, true) })), true);
  assert.equal(bridgeLoopbackCapable(status({ bridgeModes: modes(false, false, true) })), false);
  assert.equal(bridgeLoopbackCapable(status({ bridgeModes: modes(false, false, true) }), { textOnly: true }), true);
  assert.equal(bridgeLoopbackCapable(status({ bridgeModes: modes(true, true, false) }), { textOnly: true }), false);
});

test("devices ready: voice possible, or the cable where inbound is optional; null without bridgeModes", () => {
  assert.equal(bridgeDevicesReady(null), null);
  assert.equal(bridgeDevicesReady(status({ devices: [cable] })), null, "older build: the probe decides");
  assert.equal(bridgeDevicesReady(status({ bridgeModes: modes(true, true) })), true);
  // Windows, cable but no way back: outbound-only still runs, step 1 is done.
  assert.equal(bridgeDevicesReady(status({ bridgeModes: modes(false, true) })), true);
  assert.equal(bridgeDevicesReady(status({ bridgeModes: modes(false, false) })), false);
  // A Mac with only the outbound device: inbound is not optional there.
  assert.equal(bridgeDevicesReady(status({ platform: "darwin", bridgeModes: modes(false, true) })), false);
});

test("the probe downgrades on silence, a missing required device or no permission, never on an error", () => {
  assert.equal(probeDowngrades(probeOk), false);
  assert.equal(probeDowngrades({ ...probeOk, probes: [{ present: true, carriesSignal: false }] }), true);
  assert.equal(
    probeDowngrades({
      ...probeOk,
      probes: [
        { present: true, carriesSignal: true },
        { present: true, carriesSignal: false, optional: true },
      ],
    }),
    true,
    "an optional Hi-Fi Cable that is present but silent would silence the far side",
  );
  assert.equal(probeDowngrades({ ...probeOk, probes: [{ present: false, carriesSignal: null }] }), true);
  assert.equal(probeDowngrades({ ...probeOk, needsPermission: true }), true);
  assert.equal(
    probeDowngrades({ ...probeOk, probes: [{ present: true, carriesSignal: null }] }),
    false,
    "a probe that could not run is inconclusive",
  );
});

test("the probe never upgrades a desktop no, and decides alone only without a desktop verdict", () => {
  const ready = status({ bridgeModes: modes(true, true) });
  const notReady = status({ bridgeModes: modes(false, false) });
  assert.equal(bridgeDevicesReadyWithProbe(ready, null), true, "before the probe runs, the desktop stands");
  assert.equal(bridgeDevicesReadyWithProbe(ready, probeOk), true);
  assert.equal(
    bridgeDevicesReadyWithProbe(ready, { ...probeOk, probes: [{ present: true, carriesSignal: false }], ready: false }),
    false,
    "desktop ready, probe heard nothing: show the problem",
  );
  assert.equal(bridgeDevicesReadyWithProbe(notReady, probeOk), false, "never upgrade");
  // Fallback: no desktop verdict (browser, or a build before #45): the probe's own answer.
  assert.equal(bridgeDevicesReadyWithProbe(null, probeOk), true);
  assert.equal(bridgeDevicesReadyWithProbe(status({ devices: [cable] }), { ...probeOk, ready: false }), false);
  assert.equal(bridgeDevicesReadyWithProbe(null, null), false);
});
