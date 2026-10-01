import test from "node:test";
import assert from "node:assert/strict";

import {
  bridgeCapturerAway,
  canControlBridge,
  capturerHeartbeatDelayMs,
  capturerHeartbeatOutcome,
  capturerTakeoverOutcome,
  holdsCapturerLease,
  parseBridgeClaimLease,
  resolveBridgeRole,
} from "../bridge-capturer.ts";

// W4b part 1: bridge claim, the capturer lease, and who may drive the bridge from the popup.

// ── role gating (PO, 2026-10-01) ────────────────────────────────────────────

test("the host or the capturer controls the bridge; a member does not", () => {
  assert.equal(canControlBridge({ isRoomHost: true, bridgeRole: "member" }), true);
  assert.equal(canControlBridge({ isRoomHost: false, bridgeRole: "capturer" }), true);
  assert.equal(canControlBridge({ isRoomHost: true, bridgeRole: "capturer" }), true);
  assert.equal(canControlBridge({ isRoomHost: false, bridgeRole: "member" }), false);
  assert.equal(canControlBridge({ isRoomHost: false, bridgeRole: null }), false);
});

test("what the server told this window wins over the room record", () => {
  assert.equal(
    resolveBridgeRole({ userId: "u1", known: "member", bridgeCapturerUserId: "u1", isLegacyOwner: true }),
    "member",
  );
  assert.equal(
    resolveBridgeRole({ userId: "u1", known: "capturer", bridgeCapturerUserId: "u2", isLegacyOwner: false }),
    "capturer",
  );
});

test("the room record names the capturer, case-insensitively", () => {
  assert.equal(resolveBridgeRole({ userId: "ABC", bridgeCapturerUserId: "abc", isLegacyOwner: false }), "capturer");
  assert.equal(resolveBridgeRole({ userId: "u1", bridgeCapturerUserId: "u2", isLegacyOwner: true }), "member");
});

test("a legacy room with no capturer keeps the host on the far side, never anyone", () => {
  assert.equal(resolveBridgeRole({ userId: "u1", bridgeCapturerUserId: null, isLegacyOwner: true }), "capturer");
  assert.equal(resolveBridgeRole({ userId: "u1", bridgeCapturerUserId: undefined, isLegacyOwner: false }), "member");
});

test("only a lease the server granted is renewed: a legacy host does not heartbeat", () => {
  assert.equal(holdsCapturerLease({ userId: "u1", known: "capturer" }), true);
  assert.equal(holdsCapturerLease({ userId: "u1", known: "member", bridgeCapturerUserId: "u1" }), false);
  assert.equal(holdsCapturerLease({ userId: "u1", bridgeCapturerUserId: "u1" }), true);
  assert.equal(holdsCapturerLease({ userId: "u1", bridgeCapturerUserId: null }), false);
  assert.equal(holdsCapturerLease({ userId: null, bridgeCapturerUserId: "u1" }), false);
});

// ── claim response mapping ──────────────────────────────────────────────────

test("a claim response maps to the role and the lease timings", () => {
  assert.deepEqual(
    parseBridgeClaimLease({
      bridgeRole: "capturer",
      created: true,
      capturerHeartbeatIntervalSeconds: 15,
      capturerLeaseSeconds: 45,
    }),
    { bridgeRole: "capturer", created: true, heartbeatIntervalSeconds: 15, leaseSeconds: 45 },
  );
  assert.equal(parseBridgeClaimLease({ bridgeRole: "MEMBER" }).bridgeRole, "member");
});

test("an unknown role is a member, so two desktops never both capture the far side", () => {
  assert.equal(parseBridgeClaimLease({ bridgeRole: "owner" }).bridgeRole, "member");
  assert.equal(parseBridgeClaimLease({}).bridgeRole, "member");
  assert.equal(parseBridgeClaimLease(null).bridgeRole, "member");
});

test("missing or nonsense timings fall back to the server's defaults", () => {
  const lease = parseBridgeClaimLease({ bridgeRole: "capturer", capturerHeartbeatIntervalSeconds: 0, capturerLeaseSeconds: "45" });
  assert.equal(lease.heartbeatIntervalSeconds, 15);
  assert.equal(lease.leaseSeconds, 45);
  assert.equal(lease.created, false);
});

// ── heartbeat scheduling ────────────────────────────────────────────────────

test("the heartbeat runs at the interval the server named", () => {
  assert.equal(capturerHeartbeatDelayMs(15, 45), 15_000);
  assert.equal(capturerHeartbeatDelayMs(10, 45), 10_000);
});

test("the heartbeat never lets the lease lapse on one lost request: at most a third of it", () => {
  assert.equal(capturerHeartbeatDelayMs(40, 45), 15_000);
  assert.equal(capturerHeartbeatDelayMs(30, 60), 20_000);
});

test("the heartbeat is never a busy loop, whatever the response says", () => {
  assert.equal(capturerHeartbeatDelayMs(0, 45), 15_000);
  assert.equal(capturerHeartbeatDelayMs(1, 45), 5_000);
  assert.equal(capturerHeartbeatDelayMs(undefined, undefined), 15_000);
  assert.equal(capturerHeartbeatDelayMs(15, 6), 5_000);
});

test("heartbeat answers: renewed, lost to a takeover, stop for a closed room, retry otherwise", () => {
  assert.equal(capturerHeartbeatOutcome({ ok: true }), "renewed");
  assert.equal(capturerHeartbeatOutcome({ ok: false, status: 409, code: "CONFLICT" }), "lost");
  assert.equal(capturerHeartbeatOutcome({ ok: false, status: 409, code: 409 }), "lost");
  assert.equal(capturerHeartbeatOutcome({ ok: false, status: 409, code: "INVALID_STATE" }), "stop");
  assert.equal(capturerHeartbeatOutcome({ ok: false, status: 404, code: "NOT_FOUND" }), "stop");
  assert.equal(capturerHeartbeatOutcome({ ok: false, status: 403 }), "stop");
  assert.equal(capturerHeartbeatOutcome({ ok: false, status: 503 }), "retry");
  assert.equal(capturerHeartbeatOutcome({ ok: false, status: null }), "retry");
});

test("takeover answers: capturer, still live (409), refused otherwise", () => {
  assert.equal(capturerTakeoverOutcome({ ok: true }), "capturer");
  assert.equal(capturerTakeoverOutcome({ ok: false, status: 409, code: "CONFLICT" }), "still-live");
  assert.equal(capturerTakeoverOutcome({ ok: false, status: 409, code: "INVALID_STATE" }), "refused");
  assert.equal(capturerTakeoverOutcome({ ok: false, status: 403, code: "FORBIDDEN" }), "refused");
});

// ── when to offer the takeover ──────────────────────────────────────────────

test("the capturer is away when they are not CONNECTED in the participants list", () => {
  const participants = [
    { userId: "me", status: "connected" },
    { userId: "cap", status: "disconnected" },
  ];
  assert.equal(bridgeCapturerAway({ userId: "me", bridgeCapturerUserId: "cap", participants }), true);
  assert.equal(
    bridgeCapturerAway({
      userId: "me",
      bridgeCapturerUserId: "cap",
      participants: [{ userId: "cap", status: "connected" }],
    }),
    false,
  );
  // Not in the list at all (left long ago): away.
  assert.equal(bridgeCapturerAway({ userId: "me", bridgeCapturerUserId: "cap", participants: [] }), true);
});

test("unknown is not away, and nobody is away from themselves", () => {
  assert.equal(bridgeCapturerAway({ userId: "me", bridgeCapturerUserId: "cap", participants: null }), null);
  assert.equal(bridgeCapturerAway({ userId: "me", bridgeCapturerUserId: null, participants: [] }), null);
  assert.equal(bridgeCapturerAway({ userId: "me", bridgeCapturerUserId: "ME", participants: [] }), false);
});
