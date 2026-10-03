/**
 * Translated-voice bridge: the microphone picked in the popup, and what Meet hears (PO, 2026-10-03).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  RAW_MIC_NOTICE_AFTER_MS,
  bridgeMicOptions,
  bridgeOutboundLeg,
  describeBridgeMic,
  isVirtualMicrophoneLabel,
  showsRawMicNotice,
} from "../bridge-mic-device.ts";

const input = (deviceId: string, label: string) => ({ kind: "audioinput" as const, deviceId, label });

const WINDOWS_DEVICES = [
  input("default", "Default - Microphone (Realtek(R) Audio)"),
  input("communications", "Communications - Microphone (Realtek(R) Audio)"),
  input("realtek", "Microphone (Realtek(R) Audio)"),
  input("cable", "CABLE Output (VB-Audio Virtual Cable)"),
  input("hifi", "Hi-Fi Cable Output (VB-Audio Hi-Fi Cable)"),
  input("jbl", "Headset Microphone (JBL Live Beam 3)"),
  { kind: "audiooutput" as const, deviceId: "spk", label: "Speakers (Realtek(R) Audio)" },
];

test("virtual cables are never microphones", () => {
  for (const label of [
    "CABLE Output (VB-Audio Virtual Cable)",
    "Hi-Fi Cable Output (VB-Audio Hi-Fi Cable)",
    "Default - CABLE Output (VB-Audio Virtual Cable)",
    "VoiceMeeter Output (VB-Audio VoiceMeeter VAIO)",
    "BlackHole 2ch",
    "WarpTalk Microphone",
  ]) {
    assert.equal(isVirtualMicrophoneLabel(label), true, label);
  }
  for (const label of ["Microphone (Realtek(R) Audio)", "Headset Microphone (JBL Live Beam 3)", "", null]) {
    assert.equal(isVirtualMicrophoneLabel(label), false, String(label));
  }
});

test("the popup offers real inputs only, once each, default included", () => {
  assert.deepEqual(
    bridgeMicOptions(WINDOWS_DEVICES).map((option) => option.deviceId),
    ["default", "realtek", "jbl"],
  );
});

test("a default that points at the cable is not offered", () => {
  const devices = [input("default", "Default - CABLE Output (VB-Audio Virtual Cable)"), input("realtek", "Microphone (Realtek(R) Audio)")];
  assert.deepEqual(bridgeMicOptions(devices).map((option) => option.deviceId), ["realtek"]);
});

test("unlabelled devices are numbered, not dropped", () => {
  assert.deepEqual(bridgeMicOptions([input("a", ""), input("b", "")]), [
    { deviceId: "a", label: "Microphone 1" },
    { deviceId: "b", label: "Microphone 2" },
  ]);
});

test("the current device is described, and a cable is flagged", () => {
  assert.deepEqual(describeBridgeMic(WINDOWS_DEVICES, "jbl"), {
    label: "Headset Microphone (JBL Live Beam 3)",
    virtual: false,
  });
  assert.deepEqual(describeBridgeMic(WINDOWS_DEVICES, "cable"), {
    label: "CABLE Output (VB-Audio Virtual Cable)",
    virtual: true,
  });
  assert.equal(describeBridgeMic(WINDOWS_DEVICES, "gone"), null);
  assert.equal(describeBridgeMic(WINDOWS_DEVICES, null), null);
});

test("what Meet hears is named from the routing", () => {
  assert.equal(bridgeOutboundLeg({ deviceReady: false, outboundIdentity: "x", outboundRawMic: true }), "none");
  assert.equal(bridgeOutboundLeg({ deviceReady: true, outboundIdentity: "x", outboundRawMic: false }), "dub");
  assert.equal(bridgeOutboundLeg({ deviceReady: true, outboundIdentity: null, outboundRawMic: true }), "raw-mic");
  assert.equal(bridgeOutboundLeg({ deviceReady: true, outboundIdentity: null, outboundRawMic: false }), "none");
});

test("the raw-voice notice waits out the first sentence, in voice mode while translating only", () => {
  const base = {
    audioMode: "voice" as const,
    translationStarted: true,
    leg: "raw-mic" as const,
    legSinceMs: 1_000,
    sameLanguage: false,
    nowMs: 1_000 + RAW_MIC_NOTICE_AFTER_MS,
  };
  assert.equal(showsRawMicNotice(base), true);
  assert.equal(showsRawMicNotice({ ...base, nowMs: base.nowMs - 1 }), false);
  assert.equal(showsRawMicNotice({ ...base, audioMode: "text" }), false);
  assert.equal(showsRawMicNotice({ ...base, translationStarted: false }), false);
  assert.equal(showsRawMicNotice({ ...base, sameLanguage: true }), false);
  assert.equal(showsRawMicNotice({ ...base, leg: "dub" }), false);
  assert.equal(showsRawMicNotice({ ...base, legSinceMs: null }), false);
});
