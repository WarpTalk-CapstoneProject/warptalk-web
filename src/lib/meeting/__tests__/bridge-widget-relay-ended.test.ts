import test from "node:test";
import assert from "node:assert/strict";

import {
  BRIDGE_WIDGET_RELAY_VERSION,
  bridgeWidgetRoomEnded,
  buildBridgeWidgetSnapshot,
  buildEndedBridgeWidgetSnapshot,
  initialBridgeWidgetRelayView,
  parseBridgeWidgetMessage,
  reduceBridgeWidgetRelayView,
  type BridgeWidgetSnapshot,
} from "../bridge-widget-relay.ts";

// W4a: the main window tells the popup the room ENDED, and the shell keeps answering afterwards.

const ROOM = "room-1";

function received(body: Record<string, unknown>) {
  const result = parseBridgeWidgetMessage({ ...body, v: BRIDGE_WIDGET_RELAY_VERSION, roomId: ROOM }, ROOM);
  assert.ok(result.ok, "the snapshot must parse");
  assert.equal(result.message.type, "snapshot");
  return reduceBridgeWidgetRelayView(initialBridgeWidgetRelayView(ROOM), {
    roomId: ROOM,
    type: "snapshot-received",
    snapshot: result.message as unknown as BridgeWidgetSnapshot,
  });
}

test("the shell's ended snapshot parses, connects the popup and says ended", () => {
  const view = received(buildEndedBridgeWidgetSnapshot(5_000));
  assert.equal(view.status, "connected", "connected is what lets Open meeting record use the relay");
  assert.equal(bridgeWidgetRoomEnded(view), true);
  assert.equal(view.snapshot?.speakLanguage, null);
});

test("a meeting snapshot that does not say ended is not ended", () => {
  const view = received(
    buildBridgeWidgetSnapshot({ speakLanguage: "vi", voiceEnabled: true, browserCaptureState: "not-required" }, 1),
  );
  assert.equal(bridgeWidgetRoomEnded(view), false);
  assert.equal("roomEnded" in (view.snapshot ?? {}), false, "absent, not false, on the wire");
});

test("roomEnded: only true is read; false or junk from another window means nothing", () => {
  const base = buildBridgeWidgetSnapshot({ voiceEnabled: false, browserCaptureState: "not-required" }, 1);
  for (const junk of [false, "true", 1, null]) {
    const view = received({ ...base, roomEnded: junk });
    assert.equal(bridgeWidgetRoomEnded(view), false, `roomEnded=${JSON.stringify(junk)}`);
    assert.equal(view.status, "connected", "a bad optional field never costs the snapshot");
  }
});

test("without a main window nothing claims the room ended; host-gone clears it", () => {
  assert.equal(bridgeWidgetRoomEnded(initialBridgeWidgetRelayView(ROOM)), false);
  const ended = received(buildEndedBridgeWidgetSnapshot(5_000));
  const gone = reduceBridgeWidgetRelayView(ended, { roomId: ROOM, type: "host-gone" });
  assert.equal(bridgeWidgetRoomEnded(gone), false, "the popup latches it itself (use-bridge-widget-state)");
});

test("buildBridgeWidgetSnapshot never sends roomEnded unless asked", () => {
  const snapshot = buildBridgeWidgetSnapshot(
    { voiceEnabled: true, browserCaptureState: "not-required", roomEnded: false },
    1,
  );
  assert.equal("roomEnded" in snapshot, false);
});
