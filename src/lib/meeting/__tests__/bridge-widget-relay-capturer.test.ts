import test from "node:test";
import assert from "node:assert/strict";

import {
  BRIDGE_WIDGET_RELAY_VERSION,
  bridgeWidgetBridgeRole,
  buildBridgeWidgetSnapshot,
  canOfferCaptureTakeover,
  initialBridgeWidgetRelayView,
  parseBridgeWidgetMessage,
  reduceBridgeWidgetRelayView,
  type BridgeWidgetSnapshot,
} from "../bridge-widget-relay.ts";

// W4b: the relay carries this desktop's bridge role and the takeover intent, additively.

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

test("the role and the capturer's absence travel in the snapshot", () => {
  const view = connected({ ...BASE, bridgeRole: "member", bridgeCapturerAway: true });
  assert.equal(view.snapshot?.bridgeRole, "member");
  assert.equal(view.snapshot?.bridgeCapturerAway, true);
  assert.equal(bridgeWidgetBridgeRole(view, "capturer"), "member");
  assert.equal(canOfferCaptureTakeover(view), true);
});

test("a snapshot without the role leaves the popup on its own fallback and offers no takeover", () => {
  const view = connected(BASE);
  assert.equal(view.snapshot?.bridgeRole, undefined);
  assert.equal(bridgeWidgetBridgeRole(view, "capturer"), "capturer");
  assert.equal(canOfferCaptureTakeover(view), false);
});

test("an unknown role is dropped, not the whole snapshot", () => {
  const result = wire({
    type: "snapshot",
    speakLanguage: "vi",
    listenLanguage: "vi",
    voiceEnabled: false,
    browserCapture: { state: "not-required" },
    bridgeRole: "owner",
    at: 5,
  });
  assert.ok(result.ok);
  assert.equal((result.message as unknown as BridgeWidgetSnapshot).bridgeRole, undefined);
  assert.equal((result.message as unknown as BridgeWidgetSnapshot).speakLanguage, "vi");
});

test("no takeover is offered to the capturer, or while the capturer is present", () => {
  assert.equal(canOfferCaptureTakeover(connected({ ...BASE, bridgeRole: "capturer", bridgeCapturerAway: true })), false);
  assert.equal(canOfferCaptureTakeover(connected({ ...BASE, bridgeRole: "member", bridgeCapturerAway: false })), false);
  assert.equal(canOfferCaptureTakeover(initialBridgeWidgetRelayView(ROOM)), false);
});

test("take-over-capture is a known intent with no payload", () => {
  const result = wire({ type: "take-over-capture", extra: "dropped" });
  assert.ok(result.ok);
  assert.deepEqual(result.message, { type: "take-over-capture", v: BRIDGE_WIDGET_RELAY_VERSION, roomId: ROOM });
});

test("the role field did not bump the protocol version", () => {
  assert.equal(BRIDGE_WIDGET_RELAY_VERSION, 1);
});
