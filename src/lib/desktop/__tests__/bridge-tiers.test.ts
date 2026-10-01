/**
 * Which rung of the bridge ladder a machine lands on, and what it is told it is losing.
 *
 * The bug being guarded against is not a crash and not even a wrong rung on its own. It is a user
 * who believes the far side of their Google Meet is being translated when only their own voice is
 * going anywhere — a meeting that looks like it worked and did not. So these tests check two
 * things together every time: the rung selected, and the sentences that admit what it costs.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { VirtualAudioStatus } from "../bridge.ts";
import {
  BRIDGE_TIERS,
  availableBridgeTiers,
  canCaptureBrowserLoopback,
  describeLoopbackFailure,
  findBridgeTier,
  isLoopbackFallbackActive,
  selectBridgeInboundSource,
  selectBridgeTier,
  type BridgeInboundInput,
} from "../bridge-tiers.ts";
import { describeAudioBridge } from "../virtual-audio.ts";

function macFullBridge(overrides: Partial<VirtualAudioStatus> = {}): VirtualAudioStatus {
  return {
    platform: "darwin",
    supported: true,
    ready: true,
    foreignDrivers: [],
    devices: [
      { leg: "outbound", driverBundle: "BlackHole2ch.driver", deviceName: "BlackHole 2ch", installed: true },
      { leg: "inbound", driverBundle: "BlackHole16ch.driver", deviceName: "BlackHole 16ch", installed: true },
    ],
    ...overrides,
  };
}

function windowsCable(overrides: Partial<VirtualAudioStatus> = {}): VirtualAudioStatus {
  return {
    platform: "win32",
    supported: true,
    ready: false,
    bridgeMode: "outbound-only",
    recommendedProviderId: "vbcable-free",
    capabilities: {
      fullBridge: false,
      outboundOnly: true,
      captionOnly: true,
      processLoopback: true,
    },
    foreignDrivers: [],
    devices: [
      {
        leg: "outbound",
        driverBundle: "VB-CABLE",
        deviceName: "CABLE Output (VB-Audio Virtual Cable)",
        installed: true,
        providerId: "vbcable-free",
        providerName: "VB-CABLE",
        providerRole: "primary",
      },
    ],
    ...overrides,
  };
}

test("the ladder is ordered, unique, and ends in something that needs no driver", () => {
  const ranks = BRIDGE_TIERS.map((tier) => tier.rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), "selection walks the list top down");
  assert.equal(new Set(ranks).size, ranks.length, "two rungs at the same rank has no best");
  assert.equal(new Set(BRIDGE_TIERS.map((tier) => tier.id)).size, BRIDGE_TIERS.length);

  const last = BRIDGE_TIERS[BRIDGE_TIERS.length - 1];
  assert.equal(last?.id, "caption-only");
  assert.equal(last?.needsVirtualDevice, false, "the bottom rung must not depend on an install");
});

test("no reading at all is not a rung", () => {
  // A browser tab, or a desktop build predating the check. Captions themselves are a desktop
  // window, so promoting silence to caption-only would offer every browser user a window that
  // cannot open.
  assert.equal(selectBridgeTier(null), null);
  assert.deepEqual(availableBridgeTiers(null), []);
});

test("a ready bridge is the top rung and loses nothing", () => {
  const tier = selectBridgeTier(macFullBridge());

  assert.equal(tier?.id, "full-bridge");
  assert.equal(tier?.speaksIntoMeeting, true);
  assert.equal(tier?.hearsFarSide, true);
  assert.deepEqual(tier?.losses, []);
});

test("an unsupported platform still gets captions instead of nothing", () => {
  // The whole point of the ladder. Detection is missing, so no device claim can be made — but a
  // transcript window needs no device, and being handed nothing was the previous behaviour.
  const tier = selectBridgeTier(macFullBridge({ platform: "linux", supported: false, ready: false }));

  assert.equal(tier?.id, "caption-only");
  assert.deepEqual(
    availableBridgeTiers(macFullBridge({ supported: false, ready: false })).map((t) => t.id),
    ["caption-only"],
  );
});

test("unsupported beats a status that also claims readiness", () => {
  // Incoherent input. It must not resolve upward into a bridge this system cannot have.
  assert.equal(selectBridgeTier(macFullBridge({ supported: false, ready: true }))?.id, "caption-only");
});

test("process loopback being possible is not the same as it being wired", () => {
  // `processLoopback: true` says this Windows build could capture the meeting app; without
  // `processLoopbackRuntime: "available"` nothing is actually capturing. Selecting rung 2 here
  // would produce a bridge that is silent in one direction and claims to be silent in neither.
  assert.equal(selectBridgeTier(windowsCable())?.id, "outbound-only");

  const wired = windowsCable({
    capabilities: {
      fullBridge: false,
      outboundOnly: true,
      captionOnly: true,
      processLoopback: true,
      processLoopbackRuntime: "available",
    },
  });
  assert.equal(selectBridgeTier(wired)?.id, "loopback-bridge");
  assert.equal(selectBridgeTier(wired)?.hearsFarSide, true);
});

test("one free cable is enough for the outbound-only rung", () => {
  const tier = selectBridgeTier(windowsCable());

  assert.equal(tier?.id, "outbound-only");
  assert.equal(tier?.speaksIntoMeeting, true);
  assert.equal(tier?.hearsFarSide, false);
});

test("the outbound-only rung says out loud that the other side is not translated", () => {
  const tier = findBridgeTier("outbound-only");

  assert.ok(tier.losses.length > 0, "a rung that loses a direction must name it");
  assert.match(tier.losses.join(" "), /not translated/);
});

test("the caption-only rung says nothing reaches the meeting", () => {
  const tier = findBridgeTier("caption-only");

  assert.equal(tier.speaksIntoMeeting, false);
  assert.match(tier.losses.join(" "), /Nothing is played into the meeting/);
});

test("every rung that loses a direction admits it, and the two that do not stay silent", () => {
  for (const tier of BRIDGE_TIERS) {
    const complete = tier.speaksIntoMeeting && tier.hearsFarSide;
    assert.equal(
      tier.losses.length === 0,
      complete,
      `${tier.id} must list its losses exactly when it is not a full two-way bridge`,
    );
    assert.ok(tier.label.length > 0);
    assert.ok(tier.summary.length > 0);
  }
});

test("no rung's user-facing text uses the internal leg names", () => {
  // "outbound" and "inbound" are WarpTalk's words for directions the user cannot see. The person
  // reading this is looking at a microphone picker in another application.
  for (const tier of BRIDGE_TIERS) {
    const text = [tier.label, tier.summary, ...tier.losses].join(" ").toLowerCase();
    assert.ok(!text.includes("outbound"), `${tier.id} label/summary/losses say "outbound"`);
    assert.ok(!text.includes("inbound"), `${tier.id} label/summary/losses say "inbound"`);
  }
});

test("a desktop app that says outbound will not work is believed over our own optimism", () => {
  // The cable is installed and would look usable from here. `outboundOnly: false` is the desktop
  // app reporting that it looked and this path will not carry audio.
  const tier = selectBridgeTier(
    windowsCable({
      bridgeMode: "caption-only",
      capabilities: {
        fullBridge: false,
        outboundOnly: false,
        captionOnly: true,
        processLoopback: false,
      },
    }),
  );

  assert.equal(tier?.id, "caption-only");
});

test("an older desktop build that reports no capabilities still gets the cable rung", () => {
  // Absent is not the same as false. A build predating the capability flags has said nothing, and
  // refusing a rung on silence would strand exactly the users this ladder is for.
  const tier = selectBridgeTier(windowsCable({ bridgeMode: undefined, capabilities: undefined }));

  assert.equal(tier?.id, "outbound-only");
});

test("Voicemeeter endpoints that exist without a running engine are not a working rung", () => {
  // Both devices report installed, so a device-count check would call this a bridge. Audio written
  // into a stopped mixer goes nowhere, and the user would hear the meeting fail with no reason.
  const tier = selectBridgeTier({
    platform: "win32",
    supported: true,
    ready: false,
    bridgeMode: "installed-not-running",
    foreignDrivers: [],
    devices: [
      {
        leg: "outbound",
        driverBundle: "Voicemeeter AUX",
        deviceName: "VoiceMeeter Aux Output (VB-Audio VoiceMeeter AUX VAIO)",
        installed: true,
        providerId: "voicemeeter-banana",
        providerRole: "backup",
      },
      {
        leg: "inbound",
        driverBundle: "Voicemeeter VAIO",
        deviceName: "VoiceMeeter Input (VB-Audio VoiceMeeter VAIO)",
        installed: true,
        providerId: "voicemeeter-banana",
        providerRole: "backup",
      },
    ],
  });

  assert.equal(tier?.id, "caption-only");
});

test("a device that is listed but not installed carries no rung", () => {
  const tier = selectBridgeTier(
    windowsCable({
      devices: [{ ...windowsCable().devices[0]!, installed: false }],
    }),
  );

  assert.equal(tier?.id, "caption-only");
});

test("a malformed status falls to captions rather than throwing", () => {
  // The status crosses a process boundary into a separately released app.
  const tier = selectBridgeTier({ platform: "win32", supported: true, ready: false } as VirtualAudioStatus);

  assert.equal(tier?.id, "caption-only");
});

test("availableBridgeTiers reports the rungs below the selected one too", () => {
  const ids = availableBridgeTiers(windowsCable()).map((tier) => tier.id);

  assert.deepEqual(ids, ["outbound-only", "caption-only"]);
  assert.equal(ids[0], selectBridgeTier(windowsCable())?.id, "the first is the one that runs");
});

test("the panel view carries the rung, and setup state does not suppress it", () => {
  // The case that made `tier` a separate field from `state`: one of two devices installed is still
  // "needs setup" AND already able to speak into the meeting. Showing only the setup prompt hides
  // a working rung; showing only the rung hides the way to a full bridge.
  const half = windowsCable({ platform: "win32" });
  const view = describeAudioBridge(half);

  assert.equal(view.tier?.id, "outbound-only");
  assert.ok((view.tier?.losses.length ?? 0) > 0);

  const browser = describeAudioBridge(null);
  assert.equal(browser.tier, null, "nothing was checked, so there is no rung to name");

  const ready = describeAudioBridge(macFullBridge());
  assert.equal(ready.tier?.id, "full-bridge");

  const unsupported = describeAudioBridge(macFullBridge({ supported: false, ready: false }));
  assert.equal(unsupported.tier?.id, "caption-only", "the platform gap still leaves captions");
});

test("two free cables on Windows are still the top rung, but the far side comes in by loopback", () => {
  // VB-CABLE out and Hi-Fi Cable back. The desktop app reports it ready, so the ladder still names
  // the most capable rung — that is a statement about what is installed. WHICH way the far side
  // comes in is a separate decision (WT-898), and there loopback wins over the cable.
  const twoCables = windowsCable({
    ready: true,
    bridgeMode: "full",
    capabilities: {
      fullBridge: true,
      outboundOnly: true,
      captionOnly: true,
      processLoopback: true,
      processLoopbackRuntime: "available",
    },
    devices: [
      windowsCable().devices[0]!,
      {
        leg: "inbound",
        driverBundle: "Hi-Fi Cable",
        deviceName: "Hi-Fi Cable Output (VB-Audio Hi-Fi Cable)",
        installed: true,
        providerId: "hifi-cable-free",
        providerName: "Hi-Fi Cable",
        providerRole: "primary",
      },
    ],
  });

  assert.equal(selectBridgeTier(twoCables)?.id, "full-bridge");
  assert.deepEqual(
    availableBridgeTiers(twoCables).map((tier) => tier.id),
    ["full-bridge", "loopback-bridge", "outbound-only", "caption-only"],
  );
  assert.equal(describeAudioBridge(twoCables).state, "ready");
  assert.equal(canCaptureBrowserLoopback(twoCables), true);
  assert.equal(
    selectBridgeInboundSource({
      loopbackCapable: canCaptureBrowserLoopback(twoCables),
      loopbackFailed: false,
      hasInboundDevice: true,
      consentAnswer: true,
      hasLoopbackSource: true,
    }).path,
    "loopback",
    "the installed cable must not beat the browser capture",
  );
});

// WT-898 — where the far side comes in from. Loopback first, the cable only as the way back.

function wiredLoopback(overrides: Partial<VirtualAudioStatus> = {}): VirtualAudioStatus {
  return windowsCable({
    capabilities: {
      fullBridge: false,
      outboundOnly: true,
      captionOnly: true,
      processLoopback: true,
      processLoopbackRuntime: "available",
    },
    ...overrides,
  });
}

function inbound(overrides: Partial<BridgeInboundInput> = {}): BridgeInboundInput {
  return {
    loopbackCapable: true,
    loopbackFailed: false,
    hasInboundDevice: true,
    consentAnswer: true,
    hasLoopbackSource: true,
    ...overrides,
  };
}

test("loopback capability needs Windows, the capability, the runtime and VB-CABLE", () => {
  assert.equal(canCaptureBrowserLoopback(null), false, "no reading is not a capability");
  assert.equal(canCaptureBrowserLoopback(wiredLoopback()), true);
  // Build could, capture not wired: the path would be silent.
  assert.equal(canCaptureBrowserLoopback(windowsCable()), false);
  assert.equal(canCaptureBrowserLoopback(wiredLoopback({ platform: "darwin" })), false);
  assert.equal(canCaptureBrowserLoopback(wiredLoopback({ supported: false })), false);
  // Older Windows (below 20348) reports no process loopback at all.
  assert.equal(
    canCaptureBrowserLoopback(
      wiredLoopback({
        capabilities: { fullBridge: false, outboundOnly: true, captionOnly: true, processLoopback: false },
      }),
    ),
    false,
  );
  // Loopback only carries the far side in. Without VB-CABLE nothing reaches Meet, so no rung.
  assert.equal(canCaptureBrowserLoopback(wiredLoopback({ devices: [] })), false);
  // The rung and the capability are one predicate.
  assert.equal(selectBridgeTier(wiredLoopback())?.id, "loopback-bridge");
});

test("loopback wins over an installed Hi-Fi Cable", () => {
  assert.deepEqual(selectBridgeInboundSource(inbound()), {
    path: "loopback",
    startable: true,
    reason: "loopback",
  });
});

test("without loopback the device is used, and without either there is nothing", () => {
  assert.deepEqual(selectBridgeInboundSource(inbound({ loopbackCapable: false })), {
    path: "device",
    startable: true,
    reason: "loopback-unavailable",
  });
  assert.deepEqual(
    selectBridgeInboundSource(inbound({ loopbackCapable: false, hasInboundDevice: false })),
    { path: null, startable: false, reason: "no-source" },
  );
});

test("an unanswered consent waits on loopback rather than quietly running on the cable", () => {
  const decision = selectBridgeInboundSource(inbound({ consentAnswer: null }));
  assert.equal(decision.path, "loopback");
  assert.equal(decision.startable, false, "nothing may capture the browser before a yes");
  assert.equal(decision.reason, "awaiting-consent");
});

test("a declined consent falls to the cable when there is one, and to nothing when not", () => {
  assert.deepEqual(selectBridgeInboundSource(inbound({ consentAnswer: false })), {
    path: "device",
    startable: true,
    reason: "consent-declined",
  });
  assert.deepEqual(
    selectBridgeInboundSource(inbound({ consentAnswer: false, hasInboundDevice: false })),
    { path: null, startable: false, reason: "no-source" },
  );
});

test("a granted loopback still waits for a window to capture", () => {
  const decision = selectBridgeInboundSource(inbound({ hasLoopbackSource: false }));
  assert.equal(decision.path, "loopback");
  assert.equal(decision.startable, false);
  assert.equal(decision.reason, "awaiting-source");
});

test("a failed loopback start falls back to the device, whatever consent said", () => {
  for (const consentAnswer of [true, null, false]) {
    const decision = selectBridgeInboundSource(inbound({ loopbackFailed: true, consentAnswer }));
    assert.equal(decision.path, "device");
    assert.equal(decision.startable, true);
  }
  assert.equal(
    selectBridgeInboundSource(inbound({ loopbackFailed: true })).reason,
    "loopback-failed",
  );
  assert.equal(
    selectBridgeInboundSource(inbound({ loopbackFailed: true, hasInboundDevice: false })).path,
    null,
    "no device to fall back to means no inbound, not a loop back into loopback",
  );
});

test("a loopback fallback holds for its room and devices, and only those", () => {
  const fallback = { roomId: "room-1", inboundDeviceId: "hifi-1", reason: "R8: no window" };

  assert.equal(isLoopbackFallbackActive(null, { roomId: "room-1", inboundDeviceId: "hifi-1" }), false);
  assert.equal(
    isLoopbackFallbackActive(fallback, { roomId: "room-1", inboundDeviceId: "hifi-1" }),
    true,
    "same room, same devices: stay on the device instead of retrying loopback",
  );
  assert.equal(
    isLoopbackFallbackActive(fallback, { roomId: "room-2", inboundDeviceId: "hifi-1" }),
    false,
    "a new room gets loopback again",
  );
  assert.equal(
    isLoopbackFallbackActive(fallback, { roomId: "room-1", inboundDeviceId: "hifi-2" }),
    false,
    "a device change is a new situation: loopback gets one more try",
  );
  assert.equal(
    isLoopbackFallbackActive(fallback, { roomId: "room-1", inboundDeviceId: null }),
    false,
  );
});

test("a loopback failure is described by the desktop's risk id and reason when it gave them", () => {
  assert.equal(
    describeLoopbackFailure({ message: "x", riskId: "R8", reason: "window not found" }),
    "R8: window not found",
  );
  assert.equal(describeLoopbackFailure(new Error("capture failed")), "capture failed");
  assert.equal(describeLoopbackFailure(undefined), "loopback capture could not be started");
});
