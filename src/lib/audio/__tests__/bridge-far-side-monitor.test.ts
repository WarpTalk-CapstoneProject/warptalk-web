import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FAR_SIDE_MONITOR_FULL,
  FAR_SIDE_MONITOR_UNDER_DUB,
  clampMeetingAudioLevel,
  farSideMonitorGain,
  shouldMonitorFarSide,
  shouldShowMeetSpeakerResetNotice,
} from "../bridge-far-side-monitor.ts";

test("only a virtual-device source is monitored", () => {
  // A device source means Meet's speaker points at a cable, so the host hears nothing from Meet.
  assert.equal(shouldMonitorFarSide("device"), true);
  // Loopback leaves Meet playing into the host's real speakers; a local copy would double the voice.
  assert.equal(shouldMonitorFarSide("track"), false);
});

test("WT-900: a cable standing in while consent is asked is played back only once it carries Meet", () => {
  const whileAsking = (health: "unknown" | "listening" | "quiet" | "no-signal") =>
    shouldMonitorFarSide("device", { reason: "device-while-asking", health });
  // Meet may still be on the host's own speakers: a copy from a silent cable would double nothing
  // now and the voice later, the moment Meet is switched over.
  assert.equal(whileAsking("unknown"), false);
  assert.equal(whileAsking("no-signal"), false);
  assert.equal(whileAsking("quiet"), false);
  // Listening proves Meet plays into the cable and therefore not to the host.
  assert.equal(whileAsking("listening"), true);
  // Every settled device path is monitored whatever the health says.
  for (const reason of ["consent-declined", "loopback-failed", "loopback-unavailable"]) {
    assert.equal(shouldMonitorFarSide("device", { reason, health: "unknown" }), true, reason);
  }
  // Loopback is never monitored, asking or not.
  assert.equal(
    shouldMonitorFarSide("track", { reason: "device-while-asking", health: "listening" }),
    false,
  );
});

test("the original sits under the translation and returns to full level without it", () => {
  assert.equal(farSideMonitorGain(false), FAR_SIDE_MONITOR_FULL);
  assert.equal(farSideMonitorGain(true), FAR_SIDE_MONITOR_UNDER_DUB);
});

test("ducking lowers the original by default but never silences it", () => {
  // Silence would hide who is speaking and whether the translation is keeping up.
  assert.ok(FAR_SIDE_MONITOR_UNDER_DUB > 0);
  assert.ok(FAR_SIDE_MONITOR_UNDER_DUB < FAR_SIDE_MONITOR_FULL);
});

test("the host's chosen level applies under a dub, and only there", () => {
  assert.equal(farSideMonitorGain(true, 0.6), 0.6);
  // With Text only there is no translation to sit under, so the choice does not mute the call.
  assert.equal(farSideMonitorGain(false, 0), FAR_SIDE_MONITOR_FULL);
});

test("a chosen level is bounded, and an unreadable one falls back to the default", () => {
  assert.equal(clampMeetingAudioLevel(-1), 0);
  assert.equal(clampMeetingAudioLevel(4), FAR_SIDE_MONITOR_FULL);
  assert.equal(clampMeetingAudioLevel(Number.NaN), FAR_SIDE_MONITOR_UNDER_DUB);
  assert.equal(farSideMonitorGain(true, 7), FAR_SIDE_MONITOR_FULL);
});

test("hosts who may still point Meet at Hi-Fi Cable are told to undo it, only on the loopback path", () => {
  // Loopback in use and the cable still installed: the old advice leaves the host hearing nothing.
  assert.equal(shouldShowMeetSpeakerResetNotice("loopback", true), true);
  // No cable, nothing the host could have pointed Meet at.
  assert.equal(shouldShowMeetSpeakerResetNotice("loopback", false), false);
  // On the device path the monitor plays the call back, so the cable setting is still the right one.
  assert.equal(shouldShowMeetSpeakerResetNotice("device", true), false);
  assert.equal(shouldShowMeetSpeakerResetNotice(null, true), false);
});
