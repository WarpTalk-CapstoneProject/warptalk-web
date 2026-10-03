import assert from "node:assert/strict";
import test from "node:test";

import type { MeetCallState, MeetSelfMic } from "../../desktop/bridge.ts";
import {
  INITIAL_MEET_FOLLOW,
  MEET_LEAVE_RETRY_BASE_MS,
  MEET_LEAVE_RETRY_MAX_MS,
  MEET_LEFT_COUNTDOWN_MS,
  acceptsManualMic,
  describeMeetFollowMicReason,
  meetFollowInCall,
  meetFollowLeftCall,
  meetFollowMicControl,
  meetFollowMicOverridden,
  meetFollowMicTarget,
  meetLeaveCause,
  meetLeaveFailureRetryable,
  meetLeaveOutcome,
  meetLeavePrompt,
  meetLeaveRetryDelayMs,
  meetLeaveSecondsLeft,
  reduceMeetFollow,
  trustedMeetPhase,
  trustsMeetReading,
  type MeetFollowEvent,
  type MeetFollowState,
} from "../bridge-meet-follow.ts";

const ROOM_CODE = "abc-defg-hij";
const T0 = 1_000_000;

function call(phase: MeetCallState["phase"], over: Partial<MeetCallState> = {}): MeetCallState {
  return { phase, via: "tab", meetCode: ROOM_CODE, reason: "test", atMs: T0, ...over };
}

function mic(muted: boolean | null, over: Partial<MeetSelfMic> = {}): MeetSelfMic {
  return { muted, stale: false, via: "class", meetCode: ROOM_CODE, atMs: T0, ...over };
}

const callEvent = (state: MeetCallState, now = T0): MeetFollowEvent => ({
  type: "call-state",
  state,
  roomMeetCode: ROOM_CODE,
  now,
});
const micEvent = (reading: MeetSelfMic): MeetFollowEvent => ({
  type: "self-mic",
  mic: reading,
  roomMeetCode: ROOM_CODE,
});

function run(events: MeetFollowEvent[], from: MeetFollowState = INITIAL_MEET_FOLLOW): MeetFollowState {
  return events.reduce(reduceMeetFollow, from);
}

// ── which call ───────────────────────────────────────────────────────────────

test("a reading is trusted when its code is the room's, or when either side has none", () => {
  assert.equal(trustsMeetReading(ROOM_CODE, ROOM_CODE), true);
  assert.equal(trustsMeetReading("ABC-DEFG-HIJ", ROOM_CODE), true);
  // Picture-in-picture whose title carried no code; a room whose URL has none.
  assert.equal(trustsMeetReading(null, ROOM_CODE), true);
  assert.equal(trustsMeetReading(ROOM_CODE, undefined), true);
  assert.equal(trustsMeetReading("xyz-wxyz-xyz", ROOM_CODE), false);
});

test("another Meet call neither unmutes this room nor ends it", () => {
  const other = { meetCode: "xyz-wxyz-xyz" };
  const state = run([
    callEvent(call("in-call", other)),
    micEvent(mic(false, other)),
    callEvent(call("left", other)),
  ]);
  assert.deepEqual(state, INITIAL_MEET_FOLLOW);
  assert.equal(trustedMeetPhase(call("in-call", other), ROOM_CODE), null);
});

// ── mic follows Meet (WT-912) ────────────────────────────────────────────────

test("the reported defect: joining the call with Meet unmuted turns the WarpTalk mic on", () => {
  const state = run([callEvent(call("in-call")), micEvent(mic(false))]);
  assert.equal(meetFollowInCall(state), true);
  assert.equal(meetFollowMicTarget(state), true);
  assert.equal(meetFollowMicControl(state), "meet");
});

test("every mute change in Meet is the WarpTalk mic's, from the tab or from PiP", () => {
  let state = run([callEvent(call("in-call")), micEvent(mic(false))]);
  state = reduceMeetFollow(state, micEvent(mic(true)));
  assert.equal(meetFollowMicTarget(state), false);
  // The PiP window's button, whose reading may carry no code.
  state = run([callEvent(call("in-call", { via: "pip", meetCode: null })), micEvent(mic(false, { meetCode: null }))], state);
  assert.equal(meetFollowMicTarget(state), true);
});

test("the lobby does not publish the mic; its reading is what the call starts with", () => {
  let state = run([callEvent(call("lobby")), micEvent(mic(false))]);
  assert.equal(meetFollowMicTarget(state), false);
  assert.equal(meetFollowMicControl(state), "none");
  state = reduceMeetFollow(state, callEvent(call("in-call")));
  assert.equal(meetFollowMicTarget(state), true);
});

test("a stale or unreadable mic reading keeps the last one applied", () => {
  let state = run([callEvent(call("in-call")), micEvent(mic(true))]);
  // Meet went to a background tab: the desktop repeats the old value as stale, or says null.
  state = run([micEvent(mic(false, { stale: true })), micEvent(mic(null))], state);
  assert.equal(meetFollowMicTarget(state), false);
  assert.equal(meetFollowMicControl(state), "meet");
});

test("unknown never changes what is believed: the mic and the call stay where they were", () => {
  const before = run([callEvent(call("in-call")), micEvent(mic(false))]);
  const after = reduceMeetFollow(before, callEvent(call("unknown", { via: null, meetCode: null })));
  assert.equal(after, before);
  assert.equal(meetFollowMicTarget(after), true);
});

test("in the call with a button that was never read: the mic stays off and the chip is offered", () => {
  const state = run([callEvent(call("in-call")), micEvent(mic(null)), micEvent(mic(false, { stale: true }))]);
  assert.equal(meetFollowMicTarget(state), null);
  assert.equal(meetFollowMicControl(state), "manual");
});

test("an older desktop or macOS never says a phase: nothing is applied, the chip is the way out", () => {
  assert.equal(meetFollowMicTarget(INITIAL_MEET_FOLLOW), null);
  assert.equal(meetFollowMicControl(INITIAL_MEET_FOLLOW), "manual");
  // macOS: the desktop only ever says "unknown".
  const mac = reduceMeetFollow(INITIAL_MEET_FOLLOW, callEvent(call("unknown", { via: null, meetCode: null })));
  assert.equal(meetFollowMicControl(mac), "manual");
});

test("the popup's press is accepted while in the call (chip or override), never out of it", () => {
  assert.equal(acceptsManualMic("manual"), true);
  assert.equal(acceptsManualMic("meet"), true);
  assert.equal(acceptsManualMic("none"), false);
  assert.equal(acceptsManualMic(undefined), false);
});

// ── the popup's override (field evidence 2026-10-03: the sensor read "muted" on an unmuted button) ──

test("an override wins over Meet's reading until that reading next changes", () => {
  let state = run([callEvent(call("in-call")), micEvent(mic(true))]);
  assert.equal(meetFollowMicTarget(state), false);
  state = reduceMeetFollow(state, { type: "mic-override", enabled: true });
  assert.equal(meetFollowMicTarget(state), true);
  assert.equal(meetFollowMicOverridden(state), true);
  assert.equal(meetFollowMicControl(state), "meet");
  assert.match(describeMeetFollowMicReason(state), /overridden in the popup .*reads muted/);
  // The same reading again (the desktop repeats itself) keeps the override.
  state = reduceMeetFollow(state, micEvent(mic(true)));
  assert.equal(meetFollowMicTarget(state), true);
  // A change of Meet's button (the user operating Meet, or a flap) hands control back to Meet.
  state = reduceMeetFollow(state, micEvent(mic(false)));
  assert.equal(meetFollowMicOverridden(state), false);
  state = reduceMeetFollow(state, micEvent(mic(true)));
  assert.equal(meetFollowMicTarget(state), false);
});

test("pressing for what Meet already says is not an override, and ends one", () => {
  let state = run([callEvent(call("in-call")), micEvent(mic(false))]);
  assert.equal(reduceMeetFollow(state, { type: "mic-override", enabled: true }), state);
  state = reduceMeetFollow(state, { type: "mic-override", enabled: false });
  assert.equal(meetFollowMicTarget(state), false);
  state = reduceMeetFollow(state, { type: "mic-override", enabled: true });
  assert.equal(meetFollowMicOverridden(state), false);
  assert.equal(meetFollowMicTarget(state), true);
});

test("an override needs a reading to override, and ends when the user leaves the call", () => {
  const unread = run([callEvent(call("in-call"))]);
  assert.equal(reduceMeetFollow(unread, { type: "mic-override", enabled: true }), unread);
  let state = run([callEvent(call("in-call")), micEvent(mic(true)), { type: "mic-override", enabled: true }]);
  state = reduceMeetFollow(state, callEvent(call("lobby")));
  assert.equal(state.micOverride, null);
  assert.equal(meetFollowMicTarget(state), false);
  state = reduceMeetFollow(state, callEvent(call("in-call")));
  assert.equal(meetFollowMicTarget(state), false, "back in the call, Meet's reading again");
});

test("every reason the mic is on or off has words for main.log", () => {
  assert.equal(describeMeetFollowMicReason(INITIAL_MEET_FOLLOW), "Meet's mute button cannot be read");
  assert.equal(
    describeMeetFollowMicReason(run([callEvent(call("in-call")), micEvent(mic(true))])),
    "Meet's mute button reads muted",
  );
  assert.equal(describeMeetFollowMicReason(run([callEvent(call("lobby"))])), "the user is in the Meet lobby");
});

// ── leaving Meet (WT-913) ────────────────────────────────────────────────────

test("the reported defect: leaving the Meet call starts a 30 s countdown to end the room", () => {
  const state = run([callEvent(call("in-call")), micEvent(mic(false)), callEvent(call("left"), T0 + 5_000)]);
  assert.deepEqual(state.leave, { endsAtMs: T0 + 5_000 + MEET_LEFT_COUNTDOWN_MS });
  assert.equal(meetFollowLeftCall(state), true);
  // Out of the call: nothing of theirs is published, and there is no chip to publish it with.
  assert.equal(meetFollowMicTarget(state), false);
  assert.equal(meetFollowMicControl(state), "none");
  assert.deepEqual(meetLeavePrompt(state, { mayEndRoom: true }), {
    state: "countdown",
    endsAtMs: T0 + 5_000 + MEET_LEFT_COUNTDOWN_MS,
  });
});

test("a 'left' page that was never joined ends nothing", () => {
  const state = run([callEvent(call("lobby")), callEvent(call("left"))]);
  assert.equal(state.leave, null);
  assert.equal(meetLeavePrompt(state, { mayEndRoom: true }), undefined);
});

test("rejoining during the countdown cancels it silently", () => {
  const state = run([
    callEvent(call("in-call")),
    callEvent(call("left"), T0),
    callEvent(call("in-call"), T0 + 10_000),
  ]);
  assert.equal(state.leave, null);
  assert.equal(meetFollowInCall(state), true);
  assert.equal(meetLeavePrompt(state, { mayEndRoom: true }), undefined);
});

test("a repeated 'left', or an 'unknown', does not restart or cancel the countdown", () => {
  const first = run([callEvent(call("in-call")), callEvent(call("left"), T0)]);
  const later = run(
    [callEvent(call("left"), T0 + 9_000), callEvent(call("unknown", { via: null, meetCode: null }), T0 + 12_000)],
    first,
  );
  assert.deepEqual(later.leave, { endsAtMs: T0 + MEET_LEFT_COUNTDOWN_MS });
});

test("the join screen does not cancel a countdown, and closing the tab from it still counts", () => {
  // Left, then looking at the join screen: still not in the call.
  const waiting = run([callEvent(call("in-call")), callEvent(call("left"), T0), callEvent(call("lobby"))]);
  assert.deepEqual(waiting.leave, { endsAtMs: T0 + MEET_LEFT_COUNTDOWN_MS });
  // In the call, the Meet tab reloaded to the join screen, then closed.
  const reloaded = run([callEvent(call("in-call")), callEvent(call("lobby")), callEvent(call("left"), T0 + 1_000)]);
  assert.deepEqual(reloaded.leave, { endsAtMs: T0 + 1_000 + MEET_LEFT_COUNTDOWN_MS });
});

test("Keep open: no end, no prompt again until the next time the user joins and leaves", () => {
  let state = run([callEvent(call("in-call")), callEvent(call("left"), T0), { type: "keep-open" }]);
  assert.equal(state.leave, null);
  assert.deepEqual(meetLeavePrompt(state, { mayEndRoom: true }), { state: "kept" });
  // The desktop repeats "left": the prompt stays away.
  state = reduceMeetFollow(state, callEvent(call("left"), T0 + 40_000));
  assert.equal(state.leave, null);
  // Rejoin, then leave again: a new leave, a new prompt.
  state = run([callEvent(call("in-call"), T0 + 60_000), callEvent(call("left"), T0 + 90_000)], state);
  assert.deepEqual(meetLeavePrompt(state, { mayEndRoom: true }), {
    state: "countdown",
    endsAtMs: T0 + 90_000 + MEET_LEFT_COUNTDOWN_MS,
  });
});

test("a countdown that was acted on does not fire twice", () => {
  const state = run([callEvent(call("in-call")), callEvent(call("left"), T0), { type: "leave-resolved" }]);
  assert.equal(state.leave, null);
  assert.equal(reduceMeetFollow(state, { type: "leave-resolved" }), state);
  // And "Keep open" with nothing counting down is not a state change either.
  assert.equal(reduceMeetFollow(state, { type: "keep-open" }), state);
});

test("only someone who may end the room is asked; a member just leaves on their side", () => {
  const state = run([callEvent(call("in-call")), callEvent(call("left"), T0)]);
  assert.equal(meetLeavePrompt(state, { mayEndRoom: false }), undefined);
  assert.equal(meetLeaveOutcome({ mayEndRoom: true }), "end-room");
  assert.equal(meetLeaveOutcome({ mayEndRoom: false }), "leave-room");
});

test("the countdown prints whole seconds and never goes below zero", () => {
  assert.equal(meetLeaveSecondsLeft(T0 + 30_000, T0), 30);
  assert.equal(meetLeaveSecondsLeft(T0 + 30_000, T0 + 29_100), 1);
  assert.equal(meetLeaveSecondsLeft(T0 + 30_000, T0 + 31_000), 0);
});

test("the reaper is told the raw phase, unknown included, and nothing for another call", () => {
  assert.equal(trustedMeetPhase(call("in-call"), ROOM_CODE), "in-call");
  assert.equal(trustedMeetPhase(call("unknown", { meetCode: null }), ROOM_CODE), "unknown");
  assert.equal(trustedMeetPhase(null, ROOM_CODE), null);
});

// ── closing the Meet tab (PO, 2026-10-03) ────────────────────────────────────

test("closing the Meet tab is leaving: the same 30 s countdown, worded for the tab", () => {
  for (const reason of ["tab-closed", "tab-navigated", "window-closed", "browser-gone"]) {
    const state = run([callEvent(call("in-call")), callEvent(call("left", { reason }), T0)]);
    assert.deepEqual(state.leave, { endsAtMs: T0 + MEET_LEFT_COUNTDOWN_MS }, reason);
    assert.equal(meetLeaveCause(reason), "tab-closed");
    assert.deepEqual(meetLeavePrompt(state, { mayEndRoom: true }), {
      state: "countdown",
      endsAtMs: T0 + MEET_LEFT_COUNTDOWN_MS,
      cause: "tab-closed",
    });
    // Keep open remembers why, so the "kept" line can say it too.
    const kept = reduceMeetFollow(state, { type: "keep-open" });
    assert.deepEqual(meetLeavePrompt(kept, { mayEndRoom: true }), { state: "kept", cause: "tab-closed" });
  }
});

test("a desktop that sends no tab-gone reason reads exactly as before", () => {
  // `call()` sends reason "test"; older builds send free text. Neither may change the prompt's shape.
  assert.equal(meetLeaveCause("test"), "left-call");
  assert.equal(meetLeaveCause(undefined), "left-call");
  assert.equal(meetLeaveCause(""), "left-call");
  const state = run([callEvent(call("in-call")), callEvent(call("left"), T0)]);
  assert.deepEqual(meetLeavePrompt(state, { mayEndRoom: true }), {
    state: "countdown",
    endsAtMs: T0 + MEET_LEFT_COUNTDOWN_MS,
  });
});

test("a closed tab for ANOTHER call ends nothing here", () => {
  const state = run([
    callEvent(call("in-call")),
    callEvent(call("left", { reason: "tab-closed", meetCode: "xyz-wxyz-xyz" }), T0),
  ]);
  assert.equal(state.leave, null);
  assert.equal(meetFollowInCall(state), true);
});

test("the next leave after a tab-closed one is worded by its own cause", () => {
  const state = run([
    callEvent(call("in-call")),
    callEvent(call("left", { reason: "tab-closed" }), T0),
    callEvent(call("in-call"), T0 + 5_000),
    callEvent(call("left"), T0 + 10_000),
  ]);
  assert.deepEqual(meetLeavePrompt(state, { mayEndRoom: true }), {
    state: "countdown",
    endsAtMs: T0 + 10_000 + MEET_LEFT_COUNTDOWN_MS,
  });
});

// ── an End that fails is tried again (prod incident 2026-10-03) ──────────────

test("the reported defect: a failed End keeps the leave pending and retries with backoff", () => {
  const left = run([callEvent(call("in-call")), callEvent(call("left"), T0)]);
  const deadline = T0 + MEET_LEFT_COUNTDOWN_MS;
  const once = reduceMeetFollow(left, { type: "leave-failed", now: deadline, retryable: true });
  assert.deepEqual(once.leave, { endsAtMs: deadline + MEET_LEAVE_RETRY_BASE_MS, failures: 1 });
  assert.deepEqual(meetLeavePrompt(once, { mayEndRoom: true }), {
    state: "countdown",
    endsAtMs: deadline + MEET_LEAVE_RETRY_BASE_MS,
    retrying: true,
  });
  const twice = reduceMeetFollow(once, { type: "leave-failed", now: deadline + 5_000, retryable: true });
  assert.deepEqual(twice.leave, { endsAtMs: deadline + 5_000 + 2 * MEET_LEAVE_RETRY_BASE_MS, failures: 2 });
  // And it lands: the countdown is resolved like any other.
  assert.equal(reduceMeetFollow(twice, { type: "leave-resolved" }).leave, null);
});

test("the retry delay doubles and is capped", () => {
  assert.equal(meetLeaveRetryDelayMs(1), 5_000);
  assert.equal(meetLeaveRetryDelayMs(2), 10_000);
  assert.equal(meetLeaveRetryDelayMs(3), 20_000);
  assert.equal(meetLeaveRetryDelayMs(4), 40_000);
  assert.equal(meetLeaveRetryDelayMs(5), MEET_LEAVE_RETRY_MAX_MS);
  assert.equal(meetLeaveRetryDelayMs(50), MEET_LEAVE_RETRY_MAX_MS);
});

test("retrying stops on Keep open, on rejoining, and on an answer no retry will change", () => {
  const failed = reduceMeetFollow(run([callEvent(call("in-call")), callEvent(call("left"), T0)]), {
    type: "leave-failed",
    now: T0 + MEET_LEFT_COUNTDOWN_MS,
    retryable: true,
  });
  assert.equal(reduceMeetFollow(failed, { type: "keep-open" }).leave, null);
  assert.equal(reduceMeetFollow(failed, callEvent(call("in-call"), T0 + 40_000)).leave, null);
  assert.equal(
    reduceMeetFollow(failed, { type: "leave-failed", now: T0 + 40_000, retryable: false }).leave,
    null,
  );
  // A failure arriving after the user already answered or rejoined changes nothing.
  const rejoined = reduceMeetFollow(failed, callEvent(call("in-call"), T0 + 40_000));
  assert.equal(reduceMeetFollow(rejoined, { type: "leave-failed", now: T0 + 41_000, retryable: true }), rejoined);
});

test("only a failure the server has not really answered is retried", () => {
  assert.equal(meetLeaveFailureRetryable(undefined), true, "timeout / no response");
  for (const status of [500, 502, 503, 504, 408, 429]) assert.equal(meetLeaveFailureRetryable(status), true);
  for (const status of [400, 401, 403, 404, 409, 410]) assert.equal(meetLeaveFailureRetryable(status), false);
});
