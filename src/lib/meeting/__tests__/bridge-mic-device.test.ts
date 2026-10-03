/**
 * Translated-voice bridge: the microphone picked in the popup, and what Meet hears (PO, 2026-10-03).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  RAW_MIC_NOTICE_AFTER_MS,
  bridgeInboundDub,
  bridgeMicOptions,
  bridgeOutboundLeg,
  describeBridgeMic,
  describeInboundDubChange,
  isDubOfSpeaker,
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

const STAND_IN = "00000000-0000-0000-0000-00000000b21d";
const STAND_IN_DUB_EN = `ai-interpreter-en-${STAND_IN}`;

test("a dub of the Meet side is recognised in any language or voice, and only the stand-in's", () => {
  assert.equal(isDubOfSpeaker(STAND_IN_DUB_EN, STAND_IN), true);
  assert.equal(isDubOfSpeaker(`ai-interpreter-vi-${STAND_IN}`, STAND_IN), true);
  assert.equal(isDubOfSpeaker(`ai-interpreter-en-voice-1a2b3c4d-${STAND_IN}`, STAND_IN), true);
  // The host's own dub, going to Meet: not the Meet side's.
  assert.equal(isDubOfSpeaker("ai-interpreter-vi-019f0d00-0de0-7000-9000-000000000001", STAND_IN), false);
  // The stand-in's raw track is not a dub.
  assert.equal(isDubOfSpeaker(STAND_IN, STAND_IN), false);
});

test("what this person hears of the Meet side is named, and why not when it is nothing", () => {
  const playing = { identity: STAND_IN_DUB_EN, wanted: true, subscribed: true };
  const base = {
    translationActive: true,
    voiceEnabled: true,
    listenLanguage: "en",
    farSideLanguage: "vi" as string | null,
    tracks: [playing],
  };
  assert.equal(bridgeInboundDub(base), "dub");
  // The reported call: voice on, vi → en, translation running — and the question the log could
  // not answer was whether this dub was on the wire at all.
  assert.equal(bridgeInboundDub({ ...base, tracks: [] }), "no-dub");
  // On the wire but not kept, or kept and not arriving yet: still nothing reaches the speakers.
  assert.equal(bridgeInboundDub({ ...base, tracks: [{ ...playing, wanted: false }] }), "no-dub");
  assert.equal(bridgeInboundDub({ ...base, tracks: [{ ...playing, subscribed: false }] }), "no-dub");
  // A lingering bot is not played once translation stops or the switch is on Text, so neither is "dub".
  assert.equal(bridgeInboundDub({ ...base, translationActive: false }), "not-translating");
  assert.equal(bridgeInboundDub({ ...base, voiceEnabled: false }), "text");
  assert.equal(bridgeInboundDub({ ...base, farSideLanguage: "en", tracks: [] }), "same-language");
  // Unknown, or "auto" for a far side with several languages: a dub is still expected.
  assert.equal(bridgeInboundDub({ ...base, farSideLanguage: null, tracks: [] }), "no-dub");
  assert.equal(bridgeInboundDub({ ...base, farSideLanguage: "auto", tracks: [] }), "no-dub");
});

test("every inbound line is a [bridge] line carrying the facts behind it, so main.log can settle it", () => {
  const playing = { identity: STAND_IN_DUB_EN, wanted: true, subscribed: true };
  const base = {
    translationActive: true,
    voiceEnabled: true,
    listenLanguage: "en",
    farSideLanguage: "vi" as string | null,
    tracks: [playing],
  };
  for (const report of [
    base,
    { ...base, tracks: [] },
    { ...base, voiceEnabled: false },
    { ...base, translationActive: false },
    { ...base, farSideLanguage: "en", tracks: [] },
  ]) {
    assert.match(describeInboundDubChange(report), /^\[bridge\] You /);
  }

  const heard = describeInboundDubChange(base);
  assert.match(heard, new RegExp(`now hear the Meet side's translated voice \\(${STAND_IN_DUB_EN}\\)`));
  assert.match(heard, /voice on, translation running, listening in "en"/);

  assert.match(describeInboundDubChange({ ...base, tracks: [] }), /none is on the wire in "en".*dubs in the room: none\]$/);
  // The case one line has to tell apart from "none produced": produced in another language.
  const elsewhere = describeInboundDubChange({
    ...base,
    tracks: [{ identity: `ai-interpreter-vi-${STAND_IN}`, wanted: false, subscribed: false }],
  });
  assert.match(elsewhere, new RegExp(`ai-interpreter-vi-${STAND_IN} not wanted`));

  // Same report, same line: the caller logs on change, not on every render.
  assert.equal(describeInboundDubChange({ ...base }), heard);
});
