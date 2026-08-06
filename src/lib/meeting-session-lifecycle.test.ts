import assert from "node:assert/strict";
import test from "node:test";

import {
  MINI_MEETING_IDLE_TIMEOUT_MS,
  MINI_MEETING_IDLE_WARNING_MS,
  evaluateIdleMeeting,
  isIdleReaped,
  isRestoredMeetingStale,
  shouldConnectMeeting,
} from "./meeting-session-lifecycle.ts";

const MINUTE = 60 * 1000;

test("the reported defect: a token alone must not keep LiveKit connected", () => {
  // What shipped: connect={Boolean(meetingSession?.token)}. A token is never withdrawn, so a
  // minimised tab held the connection — and the billing — until the browser closed.
  assert.equal(
    shouldConnectMeeting({
      hasToken: true,
      canConnectRoom: true,
      idleReaped: true,
    }),
    false,
  );
});

test("a joinable room with a token connects", () => {
  assert.equal(
    shouldConnectMeeting({
      hasToken: true,
      canConnectRoom: true,
      idleReaped: false,
    }),
    true,
  );
});

test("a room that has ended never reconnects, however good the token is", () => {
  assert.equal(
    shouldConnectMeeting({
      hasToken: true,
      canConnectRoom: false,
      idleReaped: false,
    }),
    false,
  );
});

test("no token, no connection", () => {
  assert.equal(
    shouldConnectMeeting({
      hasToken: false,
      canConnectRoom: true,
      idleReaped: false,
    }),
    false,
  );
});

test("the full-size meeting is never idle-reaped, even after the timer fired", () => {
  assert.equal(isIdleReaped({ compact: false, idleDisconnected: true }), false);
  assert.equal(isIdleReaped({ compact: true, idleDisconnected: true }), true);
  assert.equal(isIdleReaped({ compact: true, idleDisconnected: false }), false);
});

test("someone who just interacted is left alone", () => {
  const now = 1_000_000;
  assert.equal(
    evaluateIdleMeeting({
      now,
      lastInteractionAt: now - 5 * MINUTE,
      alreadyWarned: false,
    }),
    "none",
  );
});

test("stepping away from a real meeting for ten minutes does not drop the call", () => {
  const now = 1_000_000;
  assert.equal(
    evaluateIdleMeeting({
      now,
      lastInteractionAt: now - 10 * MINUTE,
      alreadyWarned: false,
    }),
    "none",
  );
});

test("the warning lands a minute before the cut-off, not at it", () => {
  const now = 1_000_000;
  const lastInteractionAt =
    now - (MINI_MEETING_IDLE_TIMEOUT_MS - MINI_MEETING_IDLE_WARNING_MS);
  assert.equal(
    evaluateIdleMeeting({ now, lastInteractionAt, alreadyWarned: false }),
    "warn",
  );
  // One tick earlier there is nothing to say yet.
  assert.equal(
    evaluateIdleMeeting({
      now,
      lastInteractionAt: lastInteractionAt + 1,
      alreadyWarned: false,
    }),
    "none",
  );
});

test("the warning is not repeated every poll tick", () => {
  const now = 1_000_000;
  assert.equal(
    evaluateIdleMeeting({
      now,
      lastInteractionAt: now - (MINI_MEETING_IDLE_TIMEOUT_MS - 30_000),
      alreadyWarned: true,
    }),
    "none",
  );
});

test("fifteen idle minutes releases the connection", () => {
  const now = 1_000_000;
  assert.equal(
    evaluateIdleMeeting({
      now,
      lastInteractionAt: now - MINI_MEETING_IDLE_TIMEOUT_MS,
      alreadyWarned: true,
    }),
    "disconnect",
  );
  assert.equal(
    evaluateIdleMeeting({
      now,
      lastInteractionAt: now - 8 * 60 * MINUTE,
      alreadyWarned: true,
    }),
    "disconnect",
  );
});

test("an interaction resets the clock, so the countdown restarts from scratch", () => {
  const now = 1_000_000;
  const nearlyOut = now - (MINI_MEETING_IDLE_TIMEOUT_MS - 1_000);
  assert.equal(
    evaluateIdleMeeting({
      now,
      lastInteractionAt: nearlyOut,
      alreadyWarned: true,
    }),
    "none",
  );
  // ...and after the reset the person has the full budget again.
  assert.equal(
    evaluateIdleMeeting({ now, lastInteractionAt: now, alreadyWarned: false }),
    "none",
  );
});

test("the timeout is bounded on both sides: not trigger-happy, not overnight", () => {
  assert.ok(
    MINI_MEETING_IDLE_TIMEOUT_MS >= 10 * MINUTE,
    "must survive stepping away from a real meeting",
  );
  assert.ok(
    MINI_MEETING_IDLE_TIMEOUT_MS <= 30 * MINUTE,
    "a forgotten tab must stop billing well inside an hour",
  );
});

test("WT-306: a restored id pointing at an ended room retires the session", () => {
  assert.equal(
    isRestoredMeetingStale({
      compact: true,
      roomLoadFailed: false,
      hasRoom: true,
      canConnectRoom: false,
    }),
    true,
  );
});

test("a restored id the API cannot resolve at all also retires the session", () => {
  assert.equal(
    isRestoredMeetingStale({
      compact: true,
      roomLoadFailed: true,
      hasRoom: false,
      canConnectRoom: false,
    }),
    true,
  );
});

test("a room still loading is not yet stale — nothing is closed on a pending query", () => {
  assert.equal(
    isRestoredMeetingStale({
      compact: true,
      roomLoadFailed: false,
      hasRoom: false,
      canConnectRoom: false,
    }),
    false,
  );
});

test("a live restored room keeps its mini window", () => {
  assert.equal(
    isRestoredMeetingStale({
      compact: true,
      roomLoadFailed: false,
      hasRoom: true,
      canConnectRoom: true,
    }),
    false,
  );
});

test("the full-size meeting is never retired from here — the hub owns that exit", () => {
  assert.equal(
    isRestoredMeetingStale({
      compact: false,
      roomLoadFailed: true,
      hasRoom: false,
      canConnectRoom: false,
    }),
    false,
  );
});
