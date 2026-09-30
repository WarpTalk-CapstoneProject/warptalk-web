import assert from "node:assert/strict";
import { test } from "node:test";

import { endMeetingFlightKey, isInFlight, singleFlight } from "../single-flight.ts";

test("presses that arrive while the end is in flight share the one request", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const end = () =>
    singleFlight(endMeetingFlightKey("room-1"), async () => {
      calls += 1;
      await gate;
      return "ended";
    });

  const presses = [end(), end(), end(), end(), end(), end()];
  assert.equal(isInFlight(endMeetingFlightKey("room-1")), true);
  release();

  assert.deepEqual(await Promise.all(presses), Array(6).fill("ended"));
  assert.equal(calls, 1, "six presses must send one request");
  assert.equal(isInFlight(endMeetingFlightKey("room-1")), false);
});

test("a failed end releases the key, so the next press can retry", async () => {
  let calls = 0;
  const failing = () =>
    singleFlight(endMeetingFlightKey("room-2"), async () => {
      calls += 1;
      throw new Error("LiveKit unavailable");
    });

  await assert.rejects(Promise.all([failing(), failing()]), /LiveKit unavailable/);
  assert.equal(calls, 1);
  assert.equal(isInFlight(endMeetingFlightKey("room-2")), false);

  const retried = await singleFlight(endMeetingFlightKey("room-2"), async () => "ended");
  assert.equal(retried, "ended");
});

test("different rooms do not wait on each other", async () => {
  let calls = 0;
  await Promise.all([
    singleFlight(endMeetingFlightKey("a"), async () => (calls += 1)),
    singleFlight(endMeetingFlightKey("b"), async () => (calls += 1)),
  ]);
  assert.equal(calls, 2);
});
