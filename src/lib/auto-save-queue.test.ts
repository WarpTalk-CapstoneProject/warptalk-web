import assert from "node:assert/strict";
import test from "node:test";
import { AutoSaveQueue, type AutoSaveQueueState } from "./auto-save-queue.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("serializes rapid changes and only saves after the queue drains", async () => {
  const calls: number[] = [];
  const states: AutoSaveQueueState[] = [];
  let releaseFirst!: () => void;
  const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const queue = new AutoSaveQueue<number>(
    async (value) => {
      calls.push(value);
      if (value === 1) await first;
    },
    (state) => states.push(state),
  );

  queue.enqueue(1);
  queue.enqueue(2);
  await tick();
  assert.deepEqual(calls, [1]);
  assert.equal(states.at(-1)?.status, "saving");

  releaseFirst();
  await tick();
  await tick();
  assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(states.at(-1), { status: "saved", hasPendingChanges: false });
});

test("keeps a failed job pending until retry succeeds", async () => {
  const calls: number[] = [];
  const states: AutoSaveQueueState[] = [];
  let shouldFail = true;
  const queue = new AutoSaveQueue<number>(
    async (value) => {
      calls.push(value);
      if (shouldFail) throw new Error("offline");
    },
    (state) => states.push(state),
  );

  queue.enqueue(7);
  await tick();
  assert.deepEqual(calls, [7]);
  assert.deepEqual(states.at(-1), { status: "error", hasPendingChanges: true });

  shouldFail = false;
  queue.retry();
  await tick();
  assert.deepEqual(calls, [7, 7]);
  assert.deepEqual(states.at(-1), { status: "saved", hasPendingChanges: false });
});
