import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MEETING_TAIL_MS,
  IDLE_TRIGGER,
  TRIGGER_LEAD_MS,
  extractMeetCodeFromUrl,
  isWithinTriggerWindow,
  nextBridgeTrigger,
  OFFER_TRIGGER,
  selectTriggerMeeting,
  shouldShowBridgeWidget,
  type BridgeTriggerSnapshot,
} from "../bridge-trigger.ts";

const NOW = 1_700_000_000_000;
const meeting = (over: Partial<Parameters<typeof isWithinTriggerWindow>[0]> = {}) => ({
  roomId: "room-1",
  startsAtMs: NOW,
  ...over,
});

const step = (previous: BridgeTriggerSnapshot, over: Record<string, unknown> = {}) =>
  nextBridgeTrigger(previous, {
    meeting: meeting(),
    nowMs: NOW,
    meetWindowVisible: false,
    translationStarted: false,
    ...over,
  } as Parameters<typeof nextBridgeTrigger>[1]);

test("reads the room code out of a Meet join URL, and tolerates one that has none", () => {
  assert.equal(extractMeetCodeFromUrl("https://meet.google.com/abc-defg-hij"), "abc-defg-hij");
  assert.equal(extractMeetCodeFromUrl("https://meet.google.com/abc-defg-hij?authuser=0"), "abc-defg-hij");
  assert.equal(extractMeetCodeFromUrl("https://meet.google.com/"), undefined);
  assert.equal(extractMeetCodeFromUrl(null), undefined);
});

test("the widget offers itself before the meeting starts, not at the moment it does", () => {
  assert.equal(isWithinTriggerWindow(meeting(), NOW - TRIGGER_LEAD_MS), true);
  assert.equal(isWithinTriggerWindow(meeting(), NOW - TRIGGER_LEAD_MS - 1), false);
});

test("a meeting with no end time stops being eligible instead of arming the sensor forever", () => {
  assert.equal(isWithinTriggerWindow(meeting(), NOW + DEFAULT_MEETING_TAIL_MS), true);
  assert.equal(isWithinTriggerWindow(meeting(), NOW + DEFAULT_MEETING_TAIL_MS + 1), false);
  // A stated end time wins over the ceiling.
  assert.equal(isWithinTriggerWindow(meeting({ endsAtMs: NOW + 1000 }), NOW + 2000), false);
});

test("only one meeting drives the widget, and it is the nearest", () => {
  const soon = { roomId: "soon", startsAtMs: NOW + 60_000 };
  const later = { roomId: "later", startsAtMs: NOW + 4 * 60_000 };
  assert.equal(selectTriggerMeeting([later, soon], NOW)?.roomId, "soon");
  assert.equal(selectTriggerMeeting([{ roomId: "far", startsAtMs: NOW + 60 * 60_000 }], NOW), null);
});

test("no meeting means no widget", () => {
  assert.deepEqual(step(IDLE_TRIGGER, { meeting: null }), IDLE_TRIGGER);
  assert.equal(shouldShowBridgeWidget("idle"), false);
});

test("near but unseen is upcoming, which is where Open Google Meet lives", () => {
  assert.deepEqual(step(IDLE_TRIGGER), { state: "upcoming", roomId: "room-1" });
});

test("a Meet window on screen moves it to ready", () => {
  assert.deepEqual(step(IDLE_TRIGGER, { meetWindowVisible: true }), {
    state: "ready",
    roomId: "room-1",
  });
});

test("ready survives the user switching to another tab", () => {
  // The sensor only sees the ACTIVE tab's title, so a Meet in the background reads as gone. Taking
  // the controls away there would be yanking them mid-sentence.
  const ready = step(IDLE_TRIGGER, { meetWindowVisible: true });
  assert.equal(step(ready, { meetWindowVisible: false }).state, "ready");
});

test("the latch does not leak into the next meeting", () => {
  const ready = step(IDLE_TRIGGER, { meetWindowVisible: true });
  const next = nextBridgeTrigger(ready, {
    meeting: { roomId: "room-2", startsAtMs: NOW },
    nowMs: NOW,
    meetWindowVisible: false,
    translationStarted: false,
  });
  assert.deepEqual(next, { state: "upcoming", roomId: "room-2" }, "room-2 has not been seen yet");
});

test("leaving the meeting window drops the latch with it", () => {
  const ready = step(IDLE_TRIGGER, { meetWindowVisible: true });
  const after = step(ready, { nowMs: NOW + DEFAULT_MEETING_TAIL_MS + 1, meetWindowVisible: false });
  assert.deepEqual(after, IDLE_TRIGGER);
});

test("a window belonging to a different call does not count as this one", () => {
  const withCode = nextBridgeTrigger(IDLE_TRIGGER, {
    meeting: { roomId: "room-1", startsAtMs: NOW, meetCode: "abc-defg-hij" },
    nowMs: NOW,
    meetWindowVisible: true,
    observedMeetCode: "zzz-zzzz-zzz",
    translationStarted: false,
  });
  assert.equal(withCode.state, "upcoming");
});

test("a missing code is not treated as a conflict", () => {
  // Meet drops the code from the title as soon as the event has a name, which is every meeting
  // WarpBot creates. Requiring one would mean the sensor is never believed.
  const named = nextBridgeTrigger(IDLE_TRIGGER, {
    meeting: { roomId: "room-1", startsAtMs: NOW, meetCode: "abc-defg-hij" },
    nowMs: NOW,
    meetWindowVisible: true,
    translationStarted: false,
  });
  assert.equal(named.state, "ready");
});

test("running is reported while translating, and falls back to ready when stopped", () => {
  const running = step(IDLE_TRIGGER, { meetWindowVisible: true, translationStarted: true });
  assert.equal(running.state, "running");
  assert.equal(step(running, { meetWindowVisible: false }).state, "ready");
});

test("flow 2: a Meet with no room behind it is an offer, not silence", () => {
  const offer = nextBridgeTrigger(IDLE_TRIGGER, {
    meeting: null,
    nowMs: NOW,
    meetWindowVisible: true,
    translationStarted: false,
  });
  assert.deepEqual(offer, { state: "offer", roomId: null });
  assert.equal(shouldShowBridgeWidget("offer"), true);
});

test("an offer follows the sensor rather than latching", () => {
  // Nothing bounds an offer - no roomId, no scheduled window - so a latched one could never
  // expire. Better a flicker than a window that will not leave.
  const offer = nextBridgeTrigger(IDLE_TRIGGER, {
    meeting: null,
    nowMs: NOW,
    meetWindowVisible: true,
    translationStarted: false,
  });
  const gone = nextBridgeTrigger(offer, {
    meeting: null,
    nowMs: NOW,
    meetWindowVisible: false,
    translationStarted: false,
  });
  assert.deepEqual(gone, IDLE_TRIGGER);
});

test("a known meeting wins over the offer", () => {
  const withRoom = nextBridgeTrigger(IDLE_TRIGGER, {
    meeting: meeting(),
    nowMs: NOW,
    meetWindowVisible: true,
    translationStarted: false,
  });
  assert.equal(withRoom.state, "ready", "flow 1 must not be shadowed by flow 2");
});
