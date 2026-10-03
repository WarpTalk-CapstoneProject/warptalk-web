import test from "node:test";
import assert from "node:assert/strict";

import {
  BRIDGE_WIDGET_RELAY_VERSION,
  buildBridgeWidgetSnapshot,
  parseBridgeWidgetMessage,
} from "../bridge-widget-relay.ts";

// Translated-voice bridge (PO, 2026-10-03): the microphone is picked in the popup, and the popup is
// told what Meet hears. Both additive: an older window drops the intent and the field.

const ROOM = "room-1";
const BASE = { voiceEnabled: true, browserCaptureState: "not-required" as const };

function wire(body: Record<string, unknown>) {
  return parseBridgeWidgetMessage({ ...body, v: BRIDGE_WIDGET_RELAY_VERSION, roomId: ROOM }, ROOM);
}

test("set-mic-device carries the device id", () => {
  const result = wire({ type: "set-mic-device", deviceId: "jbl" });
  assert.ok(result.ok);
  assert.deepEqual(result.message, {
    v: BRIDGE_WIDGET_RELAY_VERSION,
    roomId: ROOM,
    type: "set-mic-device",
    deviceId: "jbl",
  });
});

test("the snapshot carries the microphone and what Meet hears", () => {
  const snapshot = buildBridgeWidgetSnapshot(
    { ...BASE, micDeviceId: "jbl", outbound: { leg: "raw-mic", sinceMs: 500 } },
    1_000,
  );
  const result = wire(snapshot as unknown as Record<string, unknown>);
  assert.ok(result.ok);
  assert.equal(result.ok && result.message.type === "snapshot" && result.message.micDeviceId, "jbl");
  assert.deepEqual(result.ok && result.message.type === "snapshot" && result.message.outbound, {
    leg: "raw-mic",
    sinceMs: 500,
  });
});

test("an unreadable outbound is dropped, not the snapshot", () => {
  const snapshot = buildBridgeWidgetSnapshot(BASE, 1_000) as unknown as Record<string, unknown>;
  for (const outbound of [{ leg: "shout", sinceMs: 1 }, { leg: "dub" }, { leg: "dub", sinceMs: -1 }, "dub"]) {
    const result = wire({ ...snapshot, outbound });
    assert.ok(result.ok, JSON.stringify(outbound));
    assert.equal(result.ok && result.message.type === "snapshot" && result.message.outbound, undefined);
  }
});
