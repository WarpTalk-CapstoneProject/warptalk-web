import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bridgeDeviceLabelsForPlatform,
  INBOUND_DEVICE_LABEL,
  OUTBOUND_DEVICE_LABEL,
  WINDOWS_OUTBOUND_CAPTURE_LABEL,
  WINDOWS_OUTBOUND_SINK_LABEL,
} from "../virtual-bridge-check.ts";

test("Windows writes to CABLE Input and Meet reads CABLE Output", () => {
  assert.deepEqual(bridgeDeviceLabelsForPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), {
    outboundSink: WINDOWS_OUTBOUND_SINK_LABEL,
    inboundCapture: null,
    meetMicrophone: WINDOWS_OUTBOUND_CAPTURE_LABEL,
    meetSpeaker: null,
  });
  assert.equal(WINDOWS_OUTBOUND_SINK_LABEL, "CABLE Input (VB-Audio Virtual Cable)");
  assert.equal(WINDOWS_OUTBOUND_CAPTURE_LABEL, "CABLE Output (VB-Audio Virtual Cable)");
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
});

test("macOS keeps the two BlackHole endpoints", () => {
  assert.deepEqual(bridgeDeviceLabelsForPlatform("MacIntel"), {
    outboundSink: OUTBOUND_DEVICE_LABEL,
    inboundCapture: INBOUND_DEVICE_LABEL,
    // BlackHole is one duplex device, so routing name and instruction name coincide here. That
    // coincidence is what made the Windows bug easy to write.
    meetMicrophone: OUTBOUND_DEVICE_LABEL,
    meetSpeaker: INBOUND_DEVICE_LABEL,
  });
});

/**
 * Windows is the only platform where the far side arrives without a device of its own. Any future
 * platform that also loses `inboundCapture` must say so here deliberately: the meeting-session
 * toast and the wizard both branch on it, and a silent null would quietly change what the user is
 * told to do.
 */
test("only Windows drops the inbound capture device", () => {
  assert.equal(bridgeDeviceLabelsForPlatform("Win64").inboundCapture, null);
  assert.equal(bridgeDeviceLabelsForPlatform("MacIntel").inboundCapture, INBOUND_DEVICE_LABEL);
  assert.equal(bridgeDeviceLabelsForPlatform("Linux x86_64").inboundCapture, INBOUND_DEVICE_LABEL);
});
