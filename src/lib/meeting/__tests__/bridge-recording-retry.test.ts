/**
 * WT-916 (B20): a default bridge recording whose start fails "not now" is retried on a bounded
 * schedule for the same answer; a refusal is not. A retry never fires once it may not — the
 * recording is on, the answer changed or was opted out, capture closed, control lost, room changed.
 * And the popup learns about a give-up, with a "Try again" main re-checks.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BRIDGE_RECORDING_RETRY_DELAYS_MS,
  bridgeAutoRecordingDecision,
  bridgeRecordingFailedView,
  bridgeRecordingFailurePlan,
  buildBridgeRecordingSnapshot,
  classifyBridgeRecordingStartFailure,
  parseBridgeRecordingMessage,
  resolveBridgeRecordingIntent,
  shouldKeepBridgeRecordingRetry,
  type BridgeAutoRecordingInput,
  type BridgeRecordingRetry,
} from "../bridge-recording.ts";

const ROOM = "room-1";
const OTHER = "room-2";

/** After attempt 1 of answer 1 failed: handled, nothing recording, capture open, in control. */
function input(over: Partial<BridgeAutoRecordingInput> = {}): BridgeAutoRecordingInput {
  return {
    roomId: ROOM,
    isBridgeRoom: true,
    inboundOpen: true,
    canControl: true,
    choice: { roomId: ROOM, record: true, token: 1 },
    recording: false,
    starting: false,
    handledToken: { roomId: ROOM, token: 1, attempts: 1 },
    ...over,
  };
}

const RETRY: BridgeRecordingRetry = { roomId: ROOM, token: 1, attempt: 2 };

// ── classification ───────────────────────────────────────────────────────────

test("not now: 404 (join in flight), 503 (room type lookup), 502/504/408/429, no answer", () => {
  for (const status of [404, 503, 502, 504, 408, 429, null]) {
    assert.equal(classifyBridgeRecordingStartFailure({ status }), "transient", String(status));
  }
  // A gateway rate limit or maintenance code does not turn "not now" into "no".
  assert.equal(classifyBridgeRecordingStartFailure({ status: 429, code: "RATE_LIMITED" }), "transient");
  assert.equal(classifyBridgeRecordingStartFailure({ status: 503, code: "MAINTENANCE" }), "transient");
});

test("no: 403, 400, 409, 401, 500 (today's quota failure), anything else", () => {
  for (const status of [403, 400, 409, 401, 422, 500, 501]) {
    assert.equal(classifyBridgeRecordingStartFailure({ status }), "terminal", String(status));
  }
});

test("a quota or billing reason is a refusal whatever status it came with", () => {
  for (const code of ["PROVIDER_QUOTA_EXCEEDED", "TRANSLATION_BUDGET_EXHAUSTED", "billing_required", "NO_CREDITS"]) {
    assert.equal(classifyBridgeRecordingStartFailure({ status: 503, code }), "terminal", code);
    assert.equal(classifyBridgeRecordingStartFailure({ status: null, code }), "terminal", code);
  }
  // apiErrorCode falls back to the numeric status: that is not a reason.
  assert.equal(classifyBridgeRecordingStartFailure({ status: 404, code: 404 }), "transient");
});

// ── the schedule ─────────────────────────────────────────────────────────────

test("backoff 2 s, 5 s, 15 s, 30 s, then give up", () => {
  assert.deepEqual([...BRIDGE_RECORDING_RETRY_DELAYS_MS], [2_000, 5_000, 15_000, 30_000]);
  const transient = { status: 503 };
  assert.deepEqual(bridgeRecordingFailurePlan(transient, 1), { type: "retry", attempt: 2, delayMs: 2_000 });
  assert.deepEqual(bridgeRecordingFailurePlan(transient, 2), { type: "retry", attempt: 3, delayMs: 5_000 });
  assert.deepEqual(bridgeRecordingFailurePlan(transient, 3), { type: "retry", attempt: 4, delayMs: 15_000 });
  assert.deepEqual(bridgeRecordingFailurePlan(transient, 4), { type: "retry", attempt: 5, delayMs: 30_000 });
  assert.deepEqual(bridgeRecordingFailurePlan(transient, 5), { type: "give-up", reason: "exhausted" });
  assert.deepEqual(bridgeRecordingFailurePlan(transient, 50), { type: "give-up", reason: "exhausted" });
});

test("a refusal gives up at once, on any attempt", () => {
  for (const attempt of [1, 3, 5]) {
    assert.deepEqual(bridgeRecordingFailurePlan({ status: 403 }, attempt), { type: "give-up", reason: "terminal" });
  }
});

// ── the retry and the decision ───────────────────────────────────────────────

test("without a due retry the answer stays handled: one attempt per answer, as before", () => {
  assert.deepEqual(bridgeAutoRecordingDecision(input()), { type: "none", reason: "already-handled" });
  // Old callers without `attempts` read as one attempt made.
  assert.deepEqual(
    bridgeAutoRecordingDecision(input({ handledToken: { roomId: ROOM, token: 1 } })),
    { type: "none", reason: "already-handled" },
  );
});

test("a due retry opens exactly the next attempt of the same answer", () => {
  assert.deepEqual(bridgeAutoRecordingDecision(input({ retryDue: RETRY })), {
    type: "start",
    token: 1,
    attempt: 2,
  });
  // Already spent (handled says 2 were made), skipping ahead, another answer, another room: nothing.
  for (const over of [
    { handledToken: { roomId: ROOM, token: 1, attempts: 2 } },
    { retryDue: { ...RETRY, attempt: 3 } },
    { retryDue: { ...RETRY, token: 0 } },
    { retryDue: { ...RETRY, roomId: OTHER } },
  ]) {
    assert.deepEqual(
      bridgeAutoRecordingDecision(input({ retryDue: RETRY, ...over })),
      { type: "none", reason: "already-handled" },
      JSON.stringify(over),
    );
  }
});

test("a manual Try again is a fresh chain: attempts reset to 0, retry attempt 1", () => {
  assert.deepEqual(
    bridgeAutoRecordingDecision(
      input({
        handledToken: { roomId: ROOM, token: 1, attempts: 0 },
        retryDue: { roomId: ROOM, token: 1, attempt: 1 },
      }),
    ),
    { type: "start", token: 1, attempt: 1 },
  );
});

test("a retry never fires once it may not: every other gate still runs", () => {
  const cases: Array<[Partial<BridgeAutoRecordingInput>, string]> = [
    [{ recording: true }, "already-recording"],
    [{ choice: { roomId: ROOM, record: false, token: 1 } }, "opted-out"],
    [{ inboundOpen: false }, "capture-not-open"],
    [{ canControl: false }, "cannot-control"],
    [{ starting: true }, "already-starting"],
    [{ isBridgeRoom: false }, "not-bridge"],
    [{ choice: null }, "no-choice"],
  ];
  for (const [over, reason] of cases) {
    assert.deepEqual(bridgeAutoRecordingDecision(input({ retryDue: RETRY, ...over })), { type: "none", reason });
  }
});

test("a waiting retry is kept only while it could still fire", () => {
  assert.equal(shouldKeepBridgeRecordingRetry(input(), RETRY), true);
  // The failing attempt is still winding down when its retry is scheduled.
  assert.equal(shouldKeepBridgeRecordingRetry(input({ starting: true }), RETRY), true);

  for (const over of [
    { recording: true },
    { choice: { roomId: ROOM, record: false, token: 2 } },
    // Answered again with the box checked: the new answer gets its own first attempt, not this retry.
    { choice: { roomId: ROOM, record: true, token: 2 } },
    { choice: null },
    { inboundOpen: false },
    { canControl: false },
    { roomId: OTHER },
    { handledToken: { roomId: ROOM, token: 1, attempts: 2 } },
  ] as Array<Partial<BridgeAutoRecordingInput>>) {
    assert.equal(shouldKeepBridgeRecordingRetry(input(over), RETRY), false, JSON.stringify(over));
  }
});

test("a recording stopped by hand after a retried start is not started again", () => {
  // Attempt 2 succeeded (handled says 2), then the host stopped it: no retry is due, nothing starts.
  const after = input({ handledToken: { roomId: ROOM, token: 1, attempts: 2 }, recording: false });
  assert.deepEqual(bridgeAutoRecordingDecision(after), { type: "none", reason: "already-handled" });
  // Even a stale due retry from before the success opens nothing.
  assert.deepEqual(bridgeAutoRecordingDecision({ ...after, retryDue: RETRY }), {
    type: "none",
    reason: "already-handled",
  });
});

// ── the relay ────────────────────────────────────────────────────────────────

test("failed rides on a non-recording snapshot as a trimmed, capped reason", () => {
  assert.deepEqual(
    buildBridgeRecordingSnapshot({ roomId: ROOM, recording: false, canStop: true, failed: { reason: " Quota. " } }),
    { v: 1, kind: "snapshot", roomId: ROOM, recording: false, canStop: true, failed: { reason: "Quota." } },
  );
  const recording = buildBridgeRecordingSnapshot({
    roomId: ROOM,
    recording: true,
    canStop: true,
    failed: { reason: "x" },
  });
  assert.equal("failed" in recording, false);
  const long = parseBridgeRecordingMessage({
    v: 1,
    kind: "snapshot",
    roomId: ROOM,
    recording: false,
    canStop: true,
    failed: { reason: "a".repeat(500), extra: 1 },
  });
  assert.ok(long && long.kind === "snapshot");
  assert.deepEqual(Object.keys(long.failed ?? {}), ["reason"]);
  assert.equal(long.failed?.reason.length, 200);
});

test("a malformed failed is dropped, never the whole snapshot", () => {
  for (const failed of [null, "oops", [], { reason: "" }, { reason: "   " }, { reason: 7 }, {}]) {
    assert.deepEqual(
      parseBridgeRecordingMessage({ v: 1, kind: "snapshot", roomId: ROOM, recording: false, canStop: true, failed }),
      { v: 1, kind: "snapshot", roomId: ROOM, recording: false, canStop: true },
      JSON.stringify(failed),
    );
  }
});

test("retry intent parses strictly", () => {
  assert.deepEqual(parseBridgeRecordingMessage({ v: 1, kind: "retry", roomId: ROOM, extra: 1 }), {
    v: 1,
    kind: "retry",
    roomId: ROOM,
  });
  for (const bad of [
    { v: 2, kind: "retry", roomId: ROOM },
    { v: 1, kind: "retry", roomId: "" },
    { v: 1, kind: "retry" },
    { v: 1, kind: "Retry", roomId: ROOM },
  ]) {
    assert.equal(parseBridgeRecordingMessage(bad), null, JSON.stringify(bad));
  }
});

test("main honours Try again only while it may control, is not recording and holds a give-up", () => {
  const retry = { v: 1, kind: "retry", roomId: ROOM } as const;
  const failed = { reason: "No." };
  assert.deepEqual(
    resolveBridgeRecordingIntent(retry, { roomId: ROOM, recording: false, canStop: true, failed }),
    { type: "retry" },
  );
  assert.equal(resolveBridgeRecordingIntent(retry, { roomId: ROOM, recording: true, canStop: true, failed }), null);
  assert.equal(resolveBridgeRecordingIntent(retry, { roomId: ROOM, recording: false, canStop: false, failed }), null);
  assert.equal(resolveBridgeRecordingIntent(retry, { roomId: ROOM, recording: false, canStop: true }), null);
  assert.equal(
    resolveBridgeRecordingIntent(retry, { roomId: ROOM, recording: false, canStop: true, failed: null }),
    null,
  );
  assert.equal(resolveBridgeRecordingIntent(retry, { roomId: OTHER, recording: false, canStop: true, failed }), null);
});

test("the popup line: host or capturer, this room, not recording, a give-up", () => {
  const failedSnapshot = (canStop: boolean) =>
    buildBridgeRecordingSnapshot({ roomId: ROOM, recording: false, canStop, failed: { reason: "No." } });
  assert.deepEqual(bridgeRecordingFailedView(failedSnapshot(true), ROOM), { reason: "No." });
  assert.equal(bridgeRecordingFailedView(failedSnapshot(false), ROOM), null);
  assert.equal(bridgeRecordingFailedView(failedSnapshot(true), OTHER), null);
  assert.equal(bridgeRecordingFailedView(null, ROOM), null);
  assert.equal(
    bridgeRecordingFailedView(buildBridgeRecordingSnapshot({ roomId: ROOM, recording: false, canStop: true }), ROOM),
    null,
  );
});
