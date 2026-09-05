/**
 * The audio bridge panel's copy, per platform and per install state.
 *
 * The bug this guards against is not a crash. It is a sentence that is confidently wrong: telling
 * a Windows user to install a device WarpTalk cannot detect there, or telling a browser user
 * their audio setup is broken when nothing was ever checked.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { VirtualAudioStatus } from "../bridge.ts";
import { describeAudioBridge, shouldShowAudioBridge } from "../virtual-audio.ts";

function macStatus(overrides: Partial<VirtualAudioStatus> = {}): VirtualAudioStatus {
  return {
    platform: "darwin",
    supported: true,
    ready: true,
    foreignDrivers: [],
    devices: [
      {
        leg: "outbound",
        driverBundle: "BlackHole2ch.driver",
        deviceName: "BlackHole 2ch",
        installed: true,
      },
      {
        leg: "inbound",
        driverBundle: "BlackHole16ch.driver",
        deviceName: "BlackHole 16ch",
        installed: true,
      },
    ],
    ...overrides,
  };
}

function windowsCableStatus(overrides: Partial<VirtualAudioStatus> = {}): VirtualAudioStatus {
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

test("no answer renders nothing at all", () => {
  // A browser tab, or a desktop build predating the check. Distinct from "not installed": we did
  // not look, so there is nothing honest to say.
  const view = describeAudioBridge(null);

  assert.equal(view.state, "unavailable");
  assert.equal(shouldShowAudioBridge(view), false);
  assert.equal(view.message, null);
  assert.equal(view.action, null);
  assert.deepEqual(view.devices, []);
});

test("an unsupported platform is never told to install something", () => {
  const view = describeAudioBridge(macStatus({ platform: "win32", supported: false, ready: false }));

  assert.equal(view.state, "unsupported-platform");
  assert.equal(view.action, null, "there is nothing to install that WarpTalk could then detect");
  assert.deepEqual(view.devices, [], "listing devices would imply they are checkable here");
  // Must not read as the user's fault, and must not scare them off ordinary WarpTalk meetings.
  assert.match(view.message ?? "", /still being built/);
  assert.match(view.message ?? "", /unaffected/);
});

test("unsupported is decided before readiness, whatever the flags say", () => {
  // A status claiming both `supported: false` and `ready: true` is incoherent. It must resolve to
  // the platform gap rather than announcing a bridge that cannot exist on this system.
  const view = describeAudioBridge(macStatus({ supported: false, ready: true }));

  assert.equal(view.state, "unsupported-platform");
});

test("a ready bridge names each device and which slot it goes in", () => {
  const view = describeAudioBridge(macStatus());

  assert.equal(view.state, "ready");
  assert.equal(view.action, null, "nothing left to install");
  assert.equal(view.devices.length, 2);

  const outbound = view.devices.find((device) => device.leg === "outbound");
  const inbound = view.devices.find((device) => device.leg === "inbound");

  // The device NAME is the single most useful thing here: the user has to find this exact string
  // in another application's device picker.
  assert.equal(outbound?.deviceName, "BlackHole 2ch");
  assert.equal(inbound?.deviceName, "BlackHole 16ch");

  // And the roles must not be swapped: outbound is what the other app treats as a microphone.
  assert.match(outbound?.role ?? "", /microphone/);
  assert.match(inbound?.role ?? "", /speaker/);
});

test("the two legs never carry the same role", () => {
  const view = describeAudioBridge(macStatus());
  const roles = new Set(view.devices.map((device) => device.role));

  assert.equal(roles.size, 2, "one device serving both slots would loop the dub back on itself");
});

test("neither installed asks for setup and says so plainly", () => {
  const view = describeAudioBridge(
    macStatus({
      ready: false,
      devices: macStatus().devices.map((device) => ({ ...device, installed: false })),
    }),
  );

  assert.equal(view.state, "missing");
  assert.equal(view.action, "Set up audio bridge");
  assert.match(view.message ?? "", /Neither is installed/);
});

test("a half-installed bridge is called out, not rounded to 'missing'", () => {
  // The common confusing case: one device shows up in system sound settings, so the setup looks
  // done, and the meeting then fails in exactly one direction.
  const devices = macStatus().devices.map((device) =>
    device.leg === "inbound" ? { ...device, installed: false } : device,
  );
  const view = describeAudioBridge(macStatus({ ready: false, devices }));

  assert.equal(view.state, "missing");
  assert.match(view.message ?? "", /one direction/);
  assert.equal(view.devices.filter((device) => device.installed).length, 1);
  assert.equal(view.action, "Set up audio bridge");
});

test("Windows with the free cable is shown as outbound-only, not full bridge ready", () => {
  const view = describeAudioBridge(windowsCableStatus());

  assert.equal(view.state, "outbound-only");
  assert.equal(view.action, null);
  assert.match(view.heading, /speak into the meeting/);
  assert.match(view.message ?? "", /per-process loopback/);
  assert.equal(view.devices.length, 1);
  assert.equal(view.devices[0]?.deviceName, "CABLE Output (VB-Audio Virtual Cable)");
  assert.match(view.devices[0]?.role ?? "", /microphone/);
});

test("outbound-only is decided before the generic missing copy when process loopback is available", () => {
  const view = describeAudioBridge(
    windowsCableStatus({
      bridgeMode: undefined,
      capabilities: {
        fullBridge: false,
        outboundOnly: true,
        captionOnly: true,
        processLoopback: true,
      },
    }),
  );

  assert.equal(view.state, "outbound-only");
});

test("Windows free cable on an unsupported build is caption-only, not a setup prompt", () => {
  const view = describeAudioBridge(
    windowsCableStatus({
      bridgeMode: "caption-only",
      capabilities: {
        fullBridge: false,
        outboundOnly: false,
        captionOnly: true,
        processLoopback: false,
      },
    }),
  );

  assert.equal(view.state, "caption-only");
  assert.equal(view.action, null);
  assert.match(view.message ?? "", /Windows build/);
  assert.match(view.message ?? "", /process loopback/);
});

test("Voicemeeter endpoints are not treated as ready until engine lifecycle is wired", () => {
  const view = describeAudioBridge({
    platform: "win32",
    supported: true,
    ready: false,
    bridgeMode: "installed-not-running",
    recommendedProviderId: "vbcable-free",
    capabilities: {
      fullBridge: false,
      outboundOnly: false,
      captionOnly: true,
      processLoopback: false,
    },
    foreignDrivers: [],
    devices: [
      {
        leg: "outbound",
        driverBundle: "Voicemeeter AUX",
        deviceName: "VoiceMeeter Aux Output (VB-Audio VoiceMeeter AUX VAIO)",
        installed: true,
        providerId: "voicemeeter-banana",
        providerName: "Voicemeeter Banana",
        providerRole: "backup",
      },
      {
        leg: "inbound",
        driverBundle: "Voicemeeter VAIO",
        deviceName: "VoiceMeeter Input (VB-Audio VoiceMeeter VAIO)",
        installed: true,
        providerId: "voicemeeter-banana",
        providerName: "Voicemeeter Banana",
        providerRole: "backup",
      },
    ],
  });

  assert.equal(view.state, "installed-not-running");
  assert.equal(view.action, null);
  assert.match(view.message ?? "", /engine lifecycle/);
});

test("readiness comes from the desktop app, not recomputed from the device list", () => {
  // Both devices report installed while the desktop app says not ready — it checked something
  // this build does not render. Trusting the local recomputation would show a green panel over a
  // bridge the app has already said will not run.
  const view = describeAudioBridge(macStatus({ ready: false }));

  assert.equal(view.state, "missing");
});

test("foreign drivers are surfaced but never counted as ours", () => {
  const view = describeAudioBridge(
    macStatus({ foreignDrivers: ["Soundflower.driver", "Loopback.driver"] }),
  );

  assert.deepEqual(view.foreignDrivers, ["Soundflower.driver", "Loopback.driver"]);
  assert.equal(view.devices.length, 2, "someone else's driver is not one of the two legs");
  assert.equal(view.state, "ready");
});

test("a malformed status does not throw", () => {
  // The bridge crosses a process boundary into a separately-released app; an older or newer build
  // can omit fields this one expects.
  const view = describeAudioBridge({
    platform: "darwin",
    supported: true,
    ready: false,
  } as VirtualAudioStatus);

  assert.equal(view.state, "missing");
  assert.deepEqual(view.devices, []);
  assert.deepEqual(view.foreignDrivers, []);
});

test("every shown state carries a heading and a message", () => {
  const cases: Array<VirtualAudioStatus | null> = [
    macStatus(),
    windowsCableStatus(),
    {
      ...windowsCableStatus({
        ready: false,
        bridgeMode: "installed-not-running",
        capabilities: {
          fullBridge: false,
          outboundOnly: false,
          captionOnly: true,
          processLoopback: false,
        },
      }),
    },
    windowsCableStatus({
      bridgeMode: "caption-only",
      capabilities: {
        fullBridge: false,
        outboundOnly: false,
        captionOnly: true,
        processLoopback: false,
      },
    }),
    macStatus({ ready: false }),
    macStatus({ supported: false, ready: false }),
  ];

  for (const status of cases) {
    const view = describeAudioBridge(status);
    assert.equal(shouldShowAudioBridge(view), true);
    assert.ok(view.heading.length > 0, `empty heading for ${view.state}`);
    assert.ok((view.message ?? "").length > 0, `empty message for ${view.state}`);
  }
});

test("an action is offered only when something can actually be installed", () => {
  assert.equal(describeAudioBridge(macStatus()).action, null);
  assert.equal(describeAudioBridge(macStatus({ supported: false })).action, null);
  assert.equal(describeAudioBridge(null).action, null);
  assert.notEqual(describeAudioBridge(macStatus({ ready: false })).action, null);
});
