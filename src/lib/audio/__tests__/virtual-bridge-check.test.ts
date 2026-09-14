import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bridgeDeviceLabelsForPlatform,
  bridgeProbeLegs,
  INBOUND_DEVICE_LABEL,
  isBridgeCheckReady,
  LEGACY_INBOUND_DEVICE_LABEL,
  LEGACY_OUTBOUND_DEVICE_LABEL,
  OUTBOUND_DEVICE_LABEL,
  resolveBridgeDeviceLabels,
  WINDOWS_INBOUND_CAPTURE_LABEL,
  WINDOWS_INBOUND_SINK_LABEL,
  WINDOWS_OUTBOUND_CAPTURE_LABEL,
  WINDOWS_OUTBOUND_SINK_LABEL,
  type DeviceProbe,
} from "../virtual-bridge-check.ts";

test("Windows writes to CABLE Input, Meet reads CABLE Output, and Meet plays into Hi-Fi Cable", () => {
  assert.deepEqual(bridgeDeviceLabelsForPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), {
    outboundSink: WINDOWS_OUTBOUND_SINK_LABEL,
    inboundCapture: WINDOWS_INBOUND_CAPTURE_LABEL,
    meetMicrophone: WINDOWS_OUTBOUND_CAPTURE_LABEL,
    meetSpeaker: WINDOWS_INBOUND_SINK_LABEL,
    inboundOptional: true,
    platform: "windows",
  });
  assert.equal(WINDOWS_OUTBOUND_SINK_LABEL, "CABLE Input (VB-Audio Virtual Cable)");
  assert.equal(WINDOWS_OUTBOUND_CAPTURE_LABEL, "CABLE Output (VB-Audio Virtual Cable)");
  assert.equal(WINDOWS_INBOUND_SINK_LABEL, "Hi-Fi Cable Input");
  assert.equal(WINDOWS_INBOUND_CAPTURE_LABEL, "Hi-Fi Cable Output");
});

/**
 * The two Windows names are one character apart and mean opposite things, so an edit that
 * "tidied" them into one constant would still typecheck and still route audio — into the endpoint
 * the user was told to select, which carries nothing. Asserted as an inequality so the failure
 * names the confusion rather than a string diff.
 */
test("Windows never tells the user to select the endpoint WarpTalk writes into", () => {
  const windows = bridgeDeviceLabelsForPlatform("Win32");

  assert.notEqual(windows.meetMicrophone, windows.outboundSink);
  assert.match(windows.outboundSink, /CABLE Input/);
  assert.match(windows.meetMicrophone, /CABLE Output/);
  // And the inbound cable the other way round: Meet plays INTO the input, WarpTalk records the output.
  assert.notEqual(windows.meetSpeaker, windows.inboundCapture);
  assert.match(windows.meetSpeaker ?? "", /Hi-Fi Cable Input/);
  assert.match(windows.inboundCapture ?? "", /Hi-Fi Cable Output/);
});

/**
 * Device lookup is a lowercase substring match. Hi-Fi Cable's names contain the words "Cable
 * Input" and "Cable Output", so a careless label on either side would make one cable's endpoint
 * resolve to the other's — the dub would go into the far side's return path.
 */
test("the two Windows cables cannot be mistaken for each other by substring match", () => {
  const vbCable = [WINDOWS_OUTBOUND_SINK_LABEL, WINDOWS_OUTBOUND_CAPTURE_LABEL].map((label) => label.toLowerCase());
  const hiFi = [WINDOWS_INBOUND_SINK_LABEL, WINDOWS_INBOUND_CAPTURE_LABEL].map((label) => label.toLowerCase());
  // What Windows is expected to report for Hi-Fi Cable, suffix and all.
  const hiFiReported = ["hi-fi cable input (vb-audio hi-fi cable)", "hi-fi cable output (vb-audio hi-fi cable)"];

  for (const label of vbCable) {
    for (const reported of hiFiReported) {
      assert.ok(!reported.includes(label), `${reported} must not match VB-CABLE label ${label}`);
    }
  }
  for (const label of hiFi) {
    for (const reported of vbCable) {
      assert.ok(!reported.includes(label), `${reported} must not match Hi-Fi Cable label ${label}`);
    }
  }
});

test("macOS names WarpTalk's own devices", () => {
  assert.equal(OUTBOUND_DEVICE_LABEL, "WarpTalk Microphone");
  assert.equal(INBOUND_DEVICE_LABEL, "WarpTalk Speaker");
});

test("a Mac set up with BlackHole is given BlackHole's names, as a pair", () => {
  const mac = bridgeDeviceLabelsForPlatform("MacIntel");
  const resolved = resolveBridgeDeviceLabels(mac, ["MacBook Pro Microphone", "BlackHole 2ch", "BlackHole 16ch"]);

  assert.deepEqual(
    [resolved.outboundSink, resolved.meetMicrophone, resolved.inboundCapture, resolved.meetSpeaker],
    [LEGACY_OUTBOUND_DEVICE_LABEL, LEGACY_OUTBOUND_DEVICE_LABEL, LEGACY_INBOUND_DEVICE_LABEL, LEGACY_INBOUND_DEVICE_LABEL],
  );
});

test("WarpTalk's names stay when its device is present, or when nothing is", () => {
  const mac = bridgeDeviceLabelsForPlatform("MacIntel");

  assert.deepEqual(resolveBridgeDeviceLabels(mac, ["WarpTalk Microphone", "WarpTalk Speaker", "BlackHole 2ch"]), mac);
  assert.deepEqual(resolveBridgeDeviceLabels(mac, ["MacBook Pro Microphone"]), mac, "a Mac with neither is told the new names");
});

test("Windows labels are never swapped for BlackHole's", () => {
  const windows = bridgeDeviceLabelsForPlatform("Win64");

  assert.deepEqual(resolveBridgeDeviceLabels(windows, ["BlackHole 2ch", "BlackHole 16ch"]), windows);
});

test("macOS keeps the two WarpTalk endpoints", () => {
  assert.deepEqual(bridgeDeviceLabelsForPlatform("MacIntel"), {
    outboundSink: OUTBOUND_DEVICE_LABEL,
    inboundCapture: INBOUND_DEVICE_LABEL,
    // BlackHole is one duplex device, so routing name and instruction name coincide here. That
    // coincidence is what made the Windows bug easy to write.
    meetMicrophone: OUTBOUND_DEVICE_LABEL,
    meetSpeaker: INBOUND_DEVICE_LABEL,
    inboundOptional: false,
    platform: "macos",
  });
});

/**
 * Windows is the only platform where the far side still arrives without a device of its own —
 * process loopback — so it is the only one where the inbound device may be missing. Any platform
 * that also gains a fallback must say so here deliberately: the wizard branches on it, and a silent
 * `true` would let a macOS user through with a bridge that cannot hear the meeting.
 */
test("only Windows treats the inbound device as optional", () => {
  assert.equal(bridgeDeviceLabelsForPlatform("Win64").inboundOptional, true);
  assert.equal(bridgeDeviceLabelsForPlatform("MacIntel").inboundOptional, false);
  assert.equal(bridgeDeviceLabelsForPlatform("Linux x86_64").inboundOptional, false);
});

test("each Windows leg is probed from the name one side writes into to the name the other reads", () => {
  const legs = bridgeProbeLegs(bridgeDeviceLabelsForPlatform("Win64"));

  assert.deepEqual(legs, [
    {
      leg: "outbound",
      expectedLabel: WINDOWS_OUTBOUND_CAPTURE_LABEL,
      outputLabel: WINDOWS_OUTBOUND_SINK_LABEL,
      inputLabel: WINDOWS_OUTBOUND_CAPTURE_LABEL,
      optional: false,
    },
    {
      leg: "inbound",
      expectedLabel: WINDOWS_INBOUND_SINK_LABEL,
      outputLabel: WINDOWS_INBOUND_SINK_LABEL,
      inputLabel: WINDOWS_INBOUND_CAPTURE_LABEL,
      optional: true,
    },
  ]);
});

test("macOS probes each BlackHole device against itself, as before", () => {
  const legs = bridgeProbeLegs(bridgeDeviceLabelsForPlatform("MacIntel"));

  assert.deepEqual(
    legs.map(({ leg, outputLabel, inputLabel, optional }) => [leg, outputLabel, inputLabel, optional]),
    [
      ["outbound", OUTBOUND_DEVICE_LABEL, OUTBOUND_DEVICE_LABEL, false],
      ["inbound", INBOUND_DEVICE_LABEL, INBOUND_DEVICE_LABEL, false],
    ],
  );
});

function probe(overrides: Partial<DeviceProbe>): DeviceProbe {
  return { leg: "outbound", expectedLabel: "x", present: true, carriesSignal: true, ...overrides };
}

test("a missing optional cable does not block readiness, a silent one does", () => {
  const outbound = probe({ leg: "outbound" });

  assert.equal(
    isBridgeCheckReady([outbound, probe({ leg: "inbound", present: false, carriesSignal: null, optional: true })]),
    true,
    "Windows without Hi-Fi Cable still runs, on loopback",
  );
  assert.equal(
    isBridgeCheckReady([outbound, probe({ leg: "inbound", present: true, carriesSignal: false, optional: true })]),
    false,
    "an installed cable is routed to, so a silent one would silence the far side",
  );
  assert.equal(
    isBridgeCheckReady([outbound, probe({ leg: "inbound", present: false, carriesSignal: null, optional: false })]),
    false,
    "macOS needs both",
  );
  assert.equal(
    isBridgeCheckReady([probe({ leg: "outbound", present: false, carriesSignal: null }), probe({ leg: "inbound" })]),
    false,
    "the outbound cable is never optional",
  );
});
