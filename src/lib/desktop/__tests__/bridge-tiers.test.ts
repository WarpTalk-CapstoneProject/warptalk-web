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
  findBridgeTier,
  selectBridgeTier,
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
