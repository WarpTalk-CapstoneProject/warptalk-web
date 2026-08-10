import test from "node:test";
import assert from "node:assert/strict";

import { shouldAutoStartRecording } from "../auto-recording.ts";

const ready = {
  isHost: true,
  isConnected: true,
  isRecording: false,
  hasAttempted: false,
};

test("the host starts recording once the meeting is connected", () => {
  assert.equal(shouldAutoStartRecording(ready), true);
});

test("a guest never tries", () => {
  // The server rejects SetRecording from anyone but the host, so an attempt here is a
  // guaranteed error toast on the screen of every person who is not running the meeting.
  assert.equal(shouldAutoStartRecording({ ...ready, isHost: false }), false);
});

test("nothing is asked for before the room exists", () => {
  // Egress records a LiveKit room. Asking first fails.
  assert.equal(shouldAutoStartRecording({ ...ready, isConnected: false }), false);
});

test("a live recording is not started a second time", () => {
  assert.equal(shouldAutoStartRecording({ ...ready, isRecording: true }), false);
});

test("a host who stops the recording is not overruled", () => {
  // The one that matters. With "not currently recording" as the only guard, pressing stop
  // would hand control straight back to this effect and restart it a render later.
  const afterHostPressedStop = {
    ...ready,
    isRecording: false,
    hasAttempted: true,
  };
  assert.equal(shouldAutoStartRecording(afterHostPressedStop), false);
});

test("a failed attempt is still an attempt", () => {
  // Otherwise a room that cannot record retries on every render for the whole meeting.
  assert.equal(shouldAutoStartRecording({ ...ready, hasAttempted: true }), false);
});
