import test from "node:test";
import assert from "node:assert/strict";

import {
  BRIDGE_WIDGET_RELAY_VERSION,
  bridgeWidgetAudioMode,
  buildBridgeWidgetSnapshot,
  canRelayAudioMode,
  initialBridgeWidgetRelayView,
  parseBridgeWidgetMessage,
  reduceBridgeWidgetRelayView,
  type BridgeWidgetSnapshot,
} from "../bridge-widget-relay.ts";

// Text-only bridge: the relay carries this user's audio mode and the switch intent, additively.

const ROOM = "room-1";

function wire(body: Record<string, unknown>) {
  return parseBridgeWidgetMessage({ ...body, v: BRIDGE_WIDGET_RELAY_VERSION, roomId: ROOM }, ROOM);
}

function connected(fields: Parameters<typeof buildBridgeWidgetSnapshot>[0]) {
  const result = wire(buildBridgeWidgetSnapshot(fields, 1_000) as unknown as Record<string, unknown>);
  assert.ok(result.ok, "the snapshot must parse");
  return reduceBridgeWidgetRelayView(initialBridgeWidgetRelayView(ROOM), {
    roomId: ROOM,
    type: "snapshot-received",
    snapshot: result.message as unknown as BridgeWidgetSnapshot,
  });
}

const BASE = { voiceEnabled: false, browserCaptureState: "not-required" as const };

test("the mode travels in the snapshot and wins over the popup's fallback", () => {
  const view = connected({ ...BASE, audioMode: "text" });
  assert.equal(view.snapshot?.audioMode, "text");
  assert.equal(bridgeWidgetAudioMode(view, "voice"), "text");
  assert.equal(canRelayAudioMode(view), true);
});

test("a main window that predates text-only mode: fallback mode, and no switch offered", () => {
  const view = connected(BASE);
  assert.equal(view.snapshot?.audioMode, undefined);
  assert.equal(bridgeWidgetAudioMode(view, "voice"), "voice");
  assert.equal(bridgeWidgetAudioMode(view, null), null);
  assert.equal(canRelayAudioMode(view), false);
  assert.equal(canRelayAudioMode(initialBridgeWidgetRelayView(ROOM)), false, "no main window, no switch");
});

test("an unknown mode is dropped, not the whole snapshot", () => {
  const result = wire({
    type: "snapshot",
    speakLanguage: "vi",
    listenLanguage: "vi",
    voiceEnabled: false,
    browserCapture: { state: "not-required" },
    audioMode: "loud",
    at: 5,
  });
  assert.ok(result.ok);
  assert.equal((result.message as unknown as BridgeWidgetSnapshot).audioMode, undefined);
  assert.equal((result.message as unknown as BridgeWidgetSnapshot).speakLanguage, "vi");
});

test("set-audio-mode carries exactly voice or text", () => {
  const text = wire({ type: "set-audio-mode", mode: "text", extra: "dropped" });
  assert.ok(text.ok);
  assert.deepEqual(text.message, {
    type: "set-audio-mode",
    mode: "text",
    v: BRIDGE_WIDGET_RELAY_VERSION,
    roomId: ROOM,
  });
  assert.ok(wire({ type: "set-audio-mode", mode: "voice" }).ok);
  assert.deepEqual(wire({ type: "set-audio-mode", mode: "TEXT" }), { ok: false, reason: "malformed" });
  assert.deepEqual(wire({ type: "set-audio-mode" }), { ok: false, reason: "malformed" });
});

test("a main window that has left offers no switch, whatever it said before", () => {
  const view = reduceBridgeWidgetRelayView(connected({ ...BASE, audioMode: "voice" }), {
    roomId: ROOM,
    type: "host-gone",
  });
  assert.equal(canRelayAudioMode(view), false);
  assert.equal(bridgeWidgetAudioMode(view, "text"), "text");
});

test("the mode did not bump the protocol version", () => {
  assert.equal(BRIDGE_WIDGET_RELAY_VERSION, 1);
});
