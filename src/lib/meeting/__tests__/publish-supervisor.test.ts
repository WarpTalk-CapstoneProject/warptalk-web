/**
 * The bridge publish supervisor (Meet window, Meet audio). Review of #704: a rejected publish killed
 * the loop for the rest of the recording, and every kick restarted it with a fresh back-off.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createPublishSupervisor, type PublishSupervisorClock } from "../publish-supervisor.ts";

/** A clock that runs only when told: the next due callback, and how long it was scheduled for. */
function fakeClock() {
  let next = 1;
  const timers = new Map<number, { callback: () => void; delayMs: number }>();
  const clock: PublishSupervisorClock = {
    setTimeout: (callback, delayMs) => {
      const id = next++;
      timers.set(id, { callback, delayMs });
      return id;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as number);
    },
  };
  return {
    clock,
    pending: () => [...timers.values()].map((timer) => timer.delayMs),
    /** Fires the one pending timer and lets the attempt settle. */
    fire: async () => {
      assert.equal(timers.size, 1, "exactly one next check is scheduled");
      const [[id, timer]] = [...timers.entries()];
      timers.delete(id);
      timer.callback();
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    },
  };
}

const quiet = { info: () => {}, warn: () => {} };

test("a publish that rejects is a failure, and the loop goes on", async () => {
  const time = fakeClock();
  let calls = 0;
  const supervisor = createPublishSupervisor({
    publish: () => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error("AudioContext failed"));
      if (calls === 2) throw new Error("synchronous throw");
      return Promise.resolve("published");
    },
    label: "Meet audio",
    clock: time.clock,
    log: quiet,
  });
  supervisor.start();
  await time.fire();
  assert.equal(supervisor.failures, 1);
  assert.deepEqual(time.pending(), [2_000], "rescheduled on the back-off");
  await time.fire();
  assert.equal(supervisor.failures, 2);
  assert.deepEqual(time.pending(), [4_000]);
  await time.fire();
  assert.equal(supervisor.failures, 0);
  assert.deepEqual(time.pending(), [3_000], "back to the steady interval once up");
});

test("a kick brings the next check forward without resetting the back-off", async () => {
  const time = fakeClock();
  const supervisor = createPublishSupervisor({
    publish: () => Promise.resolve("the meeting is not connected"),
    label: "Meet window",
    clock: time.clock,
    log: quiet,
  });
  supervisor.start();
  await time.fire();
  await time.fire();
  assert.equal(supervisor.failures, 2);
  supervisor.kick();
  assert.deepEqual(time.pending(), [0]);
  await time.fire();
  assert.equal(supervisor.failures, 3, "the count carried across the kick");
  assert.deepEqual(time.pending(), [8_000]);
});

test("a kick during an attempt in flight runs one check right after it, never two at once", async () => {
  const time = fakeClock();
  let concurrent = 0;
  let maxConcurrent = 0;
  let release: (value: string) => void = () => {};
  const supervisor = createPublishSupervisor({
    publish: () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      return new Promise<string>((resolve) => {
        release = (value) => {
          concurrent -= 1;
          resolve(value);
        };
      });
    },
    label: "Meet audio",
    clock: time.clock,
    log: quiet,
  });
  supervisor.start();
  await time.fire();
  supervisor.kick();
  assert.deepEqual(time.pending(), [], "nothing scheduled while the attempt is in flight");
  release("published");
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  assert.deepEqual(time.pending(), [0], "the kick runs right after");
  assert.equal(maxConcurrent, 1);
});

test("stop is final for its run: an attempt that settles afterwards schedules nothing", async () => {
  const time = fakeClock();
  let release: (value: string) => void = () => {};
  const supervisor = createPublishSupervisor({
    publish: () => new Promise<string>((resolve) => (release = resolve)),
    label: "Meet audio",
    clock: time.clock,
    log: quiet,
  });
  supervisor.start();
  await time.fire();
  supervisor.stop();
  release("the meeting is not connected");
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  assert.deepEqual(time.pending(), []);
  // A new run starts fresh.
  supervisor.start();
  assert.equal(supervisor.failures, 0);
  assert.deepEqual(time.pending(), [3_000]);
});

test("an attempt in flight across stop()+start() never leaves the new run without a timer", async () => {
  const time = fakeClock();
  const releases: Array<(value: string) => void> = [];
  const supervisor = createPublishSupervisor({
    publish: () => new Promise<string>((resolve) => releases.push(resolve)),
    label: "Meet audio",
    clock: time.clock,
    log: quiet,
  });
  supervisor.start();
  await time.fire(); // attempt 1 in flight (run 1)
  supervisor.stop();
  supervisor.start(); // run 2
  supervisor.kick(); // the kick on start is not lost to run 1's attempt
  assert.deepEqual(time.pending(), [0]);
  await time.fire(); // run 2's check is not blocked by run 1's attempt
  assert.equal(releases.length, 2);
  // Run 1's attempt settles late: it schedules nothing, and run 2 is still in flight.
  releases[0]("published");
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  assert.deepEqual(time.pending(), []);
  // Run 2's attempt settles: the loop goes on.
  releases[1]("the meeting is not connected");
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  assert.deepEqual(time.pending(), [2_000]);
  assert.equal(supervisor.failures, 1);
});

test("the reviewer's repro: stop/start during an attempt still has a timer after the old one settles", async () => {
  const time = fakeClock();
  let release: (value: string) => void = () => {};
  let calls = 0;
  const supervisor = createPublishSupervisor({
    publish: () => {
      calls += 1;
      return calls === 1 ? new Promise<string>((resolve) => (release = resolve)) : Promise.resolve("published");
    },
    label: "Meet window",
    clock: time.clock,
    log: quiet,
  });
  supervisor.start();
  await time.fire(); // attempt 1 in flight
  supervisor.stop();
  supervisor.start();
  // The new run's 3 s check fires while run 1's attempt is still in flight.
  await time.fire();
  assert.equal(calls, 2, "the new run's check ran instead of returning on run 1's in-flight mark");
  assert.deepEqual(time.pending(), [3_000]);
  release("published");
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  assert.deepEqual(time.pending(), [3_000], "still exactly one timer after the old attempt settles");
});
