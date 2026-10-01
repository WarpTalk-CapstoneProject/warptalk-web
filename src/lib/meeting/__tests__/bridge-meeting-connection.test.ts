import test from "node:test";
import assert from "node:assert/strict";

import { bridgeMeetingConnection } from "../bridge-meeting-connection.ts";

const live = { hasToken: true, canConnectRoom: true, idleReaped: false, reconnecting: false, connected: true };

test("a live meeting is connected", () => {
  assert.equal(bridgeMeetingConnection(live), "connected");
});

test("joining, before the token or before LiveKit says Connected, is connecting", () => {
  assert.equal(bridgeMeetingConnection({ ...live, hasToken: false, connected: false }), "connecting");
  assert.equal(bridgeMeetingConnection({ ...live, connected: false }), "connecting");
});

test("a reconnect is said as one", () => {
  assert.equal(bridgeMeetingConnection({ ...live, reconnecting: true }), "reconnecting");
});

test("reaped or no longer joinable is disconnected, whatever LiveKit last said", () => {
  assert.equal(bridgeMeetingConnection({ ...live, idleReaped: true }), "disconnected");
  assert.equal(bridgeMeetingConnection({ ...live, canConnectRoom: false }), "disconnected");
  assert.equal(bridgeMeetingConnection({ ...live, idleReaped: true, reconnecting: true }), "disconnected");
});
