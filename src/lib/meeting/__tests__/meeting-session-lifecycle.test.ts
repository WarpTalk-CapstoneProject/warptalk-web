import assert from "node:assert/strict";
import test from "node:test";

import {
  MINI_MEETING_IDLE_TIMEOUT_MS,
  MINI_MEETING_IDLE_WARNING_MS,
  TERMINAL_ROOM_STATUSES,
  canConnectToRoom,
  evaluateIdleMeeting,
  isIdleReaped,
  isRestoredMeetingStale,
  lastSignOfLife,
  shouldConnectMeeting,
  type MeetSensorReading,
} from "../meeting-session-lifecycle.ts";

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

// ─── canConnectToRoom ───
//
// A network outage used to end the meeting. The room comes from a REST query, so when the
// network dropped, `room` became undefined, `Boolean(room)` read as "the meeting is over",
// and <LiveKitRoom connect> flipped false — which runs room.disconnect() and aborts the
// reconnection LiveKit was already attempting. The console said it plainly: "Abort connection
// attempt due to user initiated disconnect".

test("a live room stays connectable", () => {
  assert.equal(
    canConnectToRoom({ status: "active", wasConnectable: true }),
    true,
  );
});

for (const status of TERMINAL_ROOM_STATUSES) {
  test(`a ${status} room is not connectable, even if it was a moment ago`, () => {
    assert.equal(canConnectToRoom({ status, wasConnectable: true }), false);
  });
}

test("a network failure does not end the meeting", () => {
  // No response at all: DNS failure, timeout, a request that never left the machine.
  assert.equal(
    canConnectToRoom({ status: undefined, wasConnectable: true }),
    true,
    "a lookup that could not be made must not tear down a live session",
  );
});

test("a server error does not end the meeting either", () => {
  assert.equal(
    canConnectToRoom({ status: undefined, lookupErrorStatus: 500, wasConnectable: true }),
    true,
  );
});

test("a 404 does end it — that is the server answering", () => {
  assert.equal(
    canConnectToRoom({ status: undefined, lookupErrorStatus: 404, wasConnectable: true }),
    false,
  );
  assert.equal(
    canConnectToRoom({ status: undefined, lookupErrorStatus: 410, wasConnectable: true }),
    false,
  );
});

test("an unknown room that was never connectable stays that way", () => {
  // A room id restored from sessionStorage that has never resolved must not connect on the
  // strength of not knowing.
  assert.equal(
    canConnectToRoom({ status: undefined, wasConnectable: false }),
    false,
  );
});

// ─── lastSignOfLife: the reaper's clock for an external bridge ───
//
// An EXTERNAL_BRIDGE meeting is always compact in the main window, and the host never looks at
// that window: they are in Google Meet, with the popup on top. Input in the main window was the
// only thing the reaper counted, so every bridge was cut off at 15 minutes, mid-meeting.

const T0 = 10_000_000;
const MEET_ON_SCREEN: MeetSensorReading = { meetWindowVisible: true, meetWindowLostAtMs: null };

/** What the reaper would do at `now`, fed the clock this rule produces. */
function reaperAt(now: number, over: Partial<Parameters<typeof lastSignOfLife>[0]> = {}) {
  const lastInteractionAt = lastSignOfLife({
    now,
    lastInteractionAt: T0,
    isBridgeRoom: true,
    meetSensor: null,
    lastSpeechAt: null,
    ...over,
  });
  return evaluateIdleMeeting({ now, lastInteractionAt, alreadyWarned: false });
}

test("the reported defect: a bridge host in Meet is not reaped for leaving the main window alone", () => {
  // 40 minutes into the call and the main window has not been touched since it opened.
  const now = T0 + 40 * MINUTE;
  assert.equal(
    lastSignOfLife({
      now,
      lastInteractionAt: T0,
      isBridgeRoom: true,
      meetSensor: MEET_ON_SCREEN,
      lastSpeechAt: null,
    }),
    now,
  );
  assert.equal(reaperAt(now, { meetSensor: MEET_ON_SCREEN }), "none");
});

test("an ordinary minimised meeting keeps the rule it always had: input in this window only", () => {
  // A Meet window and a talking room say nothing about a tab somebody minimised and forgot.
  assert.equal(
    lastSignOfLife({
      now: T0 + 40 * MINUTE,
      lastInteractionAt: T0,
      isBridgeRoom: false,
      meetSensor: MEET_ON_SCREEN,
      lastSpeechAt: T0 + 39 * MINUTE,
    }),
    T0,
  );
});

test("a Meet call the sighting names as a different meeting does not keep this room alive", () => {
  // The bridge room from this morning, still open, and an unrelated Meet call this afternoon.
  const otherCall: MeetSensorReading = {
    meetWindowVisible: true,
    meetCode: "xyz-wxyz-xyz",
    meetWindowLostAtMs: null,
  };
  assert.equal(
    reaperAt(T0 + 15 * MINUTE, { meetSensor: otherCall, roomMeetCode: "abc-defg-hij" }),
    "disconnect",
  );
  // The same call, named on both sides, counts.
  assert.equal(
    reaperAt(T0 + 15 * MINUTE, {
      meetSensor: { ...otherCall, meetCode: "abc-defg-hij" },
      roomMeetCode: "abc-defg-hij",
    }),
    "none",
  );
});

test("a sighting with no code still counts — picture-in-picture carries none", () => {
  assert.equal(
    reaperAt(T0 + 40 * MINUTE, { meetSensor: MEET_ON_SCREEN, roomMeetCode: "abc-defg-hij" }),
    "none",
  );
  // ...and neither does a room with no Meet URL refuse a coded sighting.
  assert.equal(
    reaperAt(T0 + 40 * MINUTE, {
      meetSensor: { ...MEET_ON_SCREEN, meetCode: "abc-defg-hij" },
    }),
    "none",
  );
});

test("once Meet leaves the screen the budget runs from that moment, not from the last click", () => {
  const leftAt = T0 + 50 * MINUTE;
  const meetGone: MeetSensorReading = { meetWindowVisible: false, meetWindowLostAtMs: leftAt };
  assert.equal(reaperAt(leftAt + 10 * MINUTE, { meetSensor: meetGone }), "none");
  assert.equal(
    reaperAt(leftAt + MINI_MEETING_IDLE_TIMEOUT_MS - MINI_MEETING_IDLE_WARNING_MS, {
      meetSensor: meetGone,
    }),
    "warn",
  );
  assert.equal(
    reaperAt(leftAt + MINI_MEETING_IDLE_TIMEOUT_MS, { meetSensor: meetGone }),
    "disconnect",
  );
});

test("a forgotten bridge is still reaped: Meet gone and nobody speaking, translation or not", () => {
  // The rule takes no translation flag on purpose. A running translation is the state a forgotten
  // bridge is left in, and the dearest one; it must not be what keeps the connection open.
  const leftAt = T0 + 30 * MINUTE;
  const lastWords = leftAt - 2 * MINUTE;
  assert.equal(
    reaperAt(leftAt + MINI_MEETING_IDLE_TIMEOUT_MS, {
      meetSensor: { meetWindowVisible: false, meetWindowLostAtMs: leftAt },
      lastSpeechAt: lastWords,
    }),
    "disconnect",
  );
});

test("without a sensor, speech in the meeting is what keeps a bridge connected", () => {
  // A browser tab, macOS, or a desktop build older than the sensor: no reading at all.
  const now = T0 + 90 * MINUTE;
  assert.equal(reaperAt(now, { meetSensor: null, lastSpeechAt: now - 3 * MINUTE }), "none");
  // Fifteen silent minutes is the same budget anybody else gets.
  assert.equal(
    reaperAt(now, { meetSensor: null, lastSpeechAt: now - MINI_MEETING_IDLE_TIMEOUT_MS }),
    "disconnect",
  );
});

test("no reading is not the same as Meet being gone", () => {
  // Null must fall back to the other evidence, never count against the host.
  assert.equal(
    lastSignOfLife({
      now: T0 + 20 * MINUTE,
      lastInteractionAt: T0,
      isBridgeRoom: true,
      meetSensor: null,
      lastSpeechAt: T0 + 19 * MINUTE,
    }),
    T0 + 19 * MINUTE,
  );
});

test("speech counts even when the sensor cannot see the Meet window it is coming from", () => {
  // A Meet window the sensor cannot read (an installed Meet app has no address bar to read) still
  // produces a transcript. The newest of the three signs wins.
  const now = T0 + 60 * MINUTE;
  assert.equal(
    lastSignOfLife({
      now,
      lastInteractionAt: T0,
      isBridgeRoom: true,
      meetSensor: { meetWindowVisible: false, meetWindowLostAtMs: null },
      lastSpeechAt: now - MINUTE,
    }),
    now - MINUTE,
  );
});

test("a bridge room opened by hand and never used still lets go after fifteen minutes", () => {
  // No Meet ever seen, nobody ever spoke: the last click in the main window is all there is.
  assert.equal(
    reaperAt(T0 + MINI_MEETING_IDLE_TIMEOUT_MS, {
      meetSensor: { meetWindowVisible: false, meetWindowLostAtMs: null },
    }),
    "disconnect",
  );
});

test("main-window input still counts for a bridge when it is the newest sign", () => {
  const now = T0 + 20 * MINUTE;
  assert.equal(
    lastSignOfLife({
      now,
      lastInteractionAt: now - MINUTE,
      isBridgeRoom: true,
      meetSensor: { meetWindowVisible: false, meetWindowLostAtMs: T0 },
      lastSpeechAt: T0,
    }),
    now - MINUTE,
  );
});
