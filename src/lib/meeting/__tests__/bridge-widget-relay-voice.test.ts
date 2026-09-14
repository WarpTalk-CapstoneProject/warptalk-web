import test from "node:test";
import assert from "node:assert/strict";

import {
  BRIDGE_WIDGET_RELAY_VERSION,
  buildBridgeWidgetSnapshot,
  parseBridgeWidgetMessage,
  type BridgeWidgetMessage,
  type BridgeWidgetVoiceSnapshot,
} from "../bridge-widget-relay.ts";

const ROOM = "room-1";
const v = BRIDGE_WIDGET_RELAY_VERSION;

const voice = (over: Partial<BridgeWidgetVoiceSnapshot> = {}): BridgeWidgetVoiceSnapshot => ({
  voicePreference: null,
  dubVoice: null,
  voiceCloneEnabled: true,
  voiceCloneHasAudience: true,
  cloneCapture: null,
  meetingAudioLevel: 0.3,
  ...over,
});

const snapshotWire = (over: Record<string, unknown> = {}) => ({
  v,
  roomId: ROOM,
  type: "snapshot",
  speakLanguage: "vi",
  listenLanguage: "vi",
  voiceEnabled: true,
  browserCapture: { state: "not-required" },
  at: 1_000,
  ...over,
});

test("the popup's voice intents are accepted, rebuilt field by field", () => {
  const cases: Array<Record<string, unknown>> = [
    { type: "set-voice-preference", voiceId: "a0e99841-438c-4a64-b679-ae501e7d6091" },
    { type: "set-voice-preference", voiceId: "" },
    { type: "set-dub-voice", voiceId: "a0e99841-438c-4a64-b679-ae501e7d6091" },
    { type: "set-dub-voice", voiceId: null },
    { type: "set-voice-clone-consent", enabled: true },
    { type: "set-voice-clone-consent", enabled: false },
    { type: "set-meeting-audio-level", level: 0 },
    { type: "set-meeting-audio-level", level: 0.45 },
    { type: "set-meeting-audio-level", level: 1 },
  ];
  for (const body of cases) {
    const result = parseBridgeWidgetMessage({ v, roomId: ROOM, ...body, extra: "dropped" }, ROOM);
    assert.deepEqual(result, { ok: true, message: { v, roomId: ROOM, ...body } }, JSON.stringify(body));
  }
});

test("a voice intent that is not quite right is malformed, never reinterpreted", () => {
  const cases: Array<Record<string, unknown>> = [
    // "Automatic" is "", not a missing id: an absent field must not quietly clear a pick.
    { type: "set-voice-preference" },
    { type: "set-voice-preference", voiceId: null },
    { type: "set-voice-preference", voiceId: 7 },
    // "Clone me live" is null, not a missing id, for the same reason.
    { type: "set-dub-voice" },
    { type: "set-dub-voice", voiceId: "" },
    { type: "set-voice-clone-consent", enabled: "true" },
    { type: "set-meeting-audio-level", level: 1.5 },
    { type: "set-meeting-audio-level", level: -0.1 },
    { type: "set-meeting-audio-level", level: Number.NaN },
    { type: "set-meeting-audio-level", level: "0.3" },
  ];
  for (const body of cases) {
    assert.deepEqual(
      parseBridgeWidgetMessage({ v, roomId: ROOM, ...body }, ROOM),
      { ok: false, reason: "malformed" },
      JSON.stringify(body),
    );
  }
});

test("a snapshot carries the voice half when the main window has one", () => {
  const result = parseBridgeWidgetMessage(
    snapshotWire({
      voice: {
        ...voice({ voicePreference: "voice-a", dubVoice: "voice-b" }),
        // Untyped on purpose: this is what another window might send, not what this one would build.
        cloneCapture: { speakerId: "user-1", reason: "collecting", seconds: 6, requiredSeconds: 10, secret: "x" },
      },
    }),
    ROOM,
  );

  assert.ok(result.ok);
  const message = result.message as Extract<BridgeWidgetMessage, { type: "snapshot" }>;
  assert.deepEqual(message.voice, {
    voicePreference: "voice-a",
    dubVoice: "voice-b",
    voiceCloneEnabled: true,
    voiceCloneHasAudience: true,
    // Rebuilt: a field the protocol does not name never reaches the panel.
    cloneCapture: { speakerId: "user-1", reason: "collecting", seconds: 6, requiredSeconds: 10 },
    meetingAudioLevel: 0.3,
  });
});

test("a snapshot from a main window that predates the Voice panel is still a snapshot", () => {
  const result = parseBridgeWidgetMessage(snapshotWire(), ROOM);

  assert.ok(result.ok);
  assert.equal((result.message as Extract<BridgeWidgetMessage, { type: "snapshot" }>).voice, undefined);
});

test("a broken voice half rejects the whole snapshot rather than drawing half a panel", () => {
  const broken: Array<Record<string, unknown>> = [
    { ...voice(), voiceCloneEnabled: "yes" },
    { ...voice(), meetingAudioLevel: 2 },
    { ...voice(), meetingAudioLevel: undefined },
    { ...voice(), dubVoice: "" },
    { ...voice(), cloneCapture: { reason: "collecting" } },
    { ...voice(), cloneCapture: { speakerId: "user-1", reason: "collecting", seconds: "6" } },
  ];
  for (const bad of broken) {
    assert.deepEqual(
      parseBridgeWidgetMessage(snapshotWire({ voice: bad }), ROOM),
      { ok: false, reason: "malformed" },
      JSON.stringify(bad),
    );
  }
});

test("null meeting audio means WarpTalk does not play the call, and is kept as null", () => {
  const result = parseBridgeWidgetMessage(snapshotWire({ voice: voice({ meetingAudioLevel: null }) }), ROOM);

  assert.ok(result.ok);
  assert.equal((result.message as Extract<BridgeWidgetMessage, { type: "snapshot" }>).voice?.meetingAudioLevel, null);
});

test("the main window's snapshot includes the voice half it was given, and only then", () => {
  const withVoice = buildBridgeWidgetSnapshot(
    { voiceEnabled: true, browserCaptureState: "not-required", voice: voice() },
    5,
  );
  const without = buildBridgeWidgetSnapshot({ voiceEnabled: false, browserCaptureState: "not-required" }, 5);

  assert.deepEqual(withVoice.voice, voice());
  assert.equal("voice" in without, false);

  // And what it builds is what the popup accepts.
  const roundTrip = parseBridgeWidgetMessage({ ...withVoice, v, roomId: ROOM }, ROOM);
  assert.ok(roundTrip.ok);
});
