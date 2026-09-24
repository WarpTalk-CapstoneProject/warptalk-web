import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESENCE_IDS_PER_CALL, createPresenceBatcher, type PresenceStates } from "../presence-batcher.ts";

function harness(answer: (ids: string[]) => Promise<PresenceStates> = async (ids) =>
  Object.fromEntries(ids.map((id) => [id, "Online" as const]))) {
  const calls: string[][] = [];
  const delivered: PresenceStates[] = [];
  let pendingFlush: (() => void) | null = null;
  const batcher = createPresenceBatcher({
    invoke: (ids) => {
      calls.push(ids);
      return answer(ids);
    },
    onStates: (states) => delivered.push(states),
    // Drive "the end of the tick" by hand so the test decides what counts as one tick.
    schedule: (flush) => {
      pendingFlush = flush;
    },
  });
  const tick = () => {
    const flush = pendingFlush;
    pendingFlush = null;
    flush?.();
  };
  return { batcher, calls, delivered, tick };
}

test("ids asked for by several consumers in the same tick go out in one call", async () => {
  const { batcher, calls, delivered, tick } = harness();

  const list = batcher.request(["a", "b"]);
  const panel = batcher.request(["b", "c"]);
  const dot = batcher.request(["c"]);
  tick();
  await Promise.all([list, panel, dot]);

  assert.deepEqual(calls, [["a", "b", "c"]]);
  assert.deepEqual(delivered, [{ a: "Online", b: "Online", c: "Online" }]);
});

test("an id already in flight is waited for, not asked for again", async () => {
  let release!: () => void;
  const { batcher, calls, tick } = harness(
    (ids) =>
      new Promise((resolve) => {
        release = () => resolve(Object.fromEntries(ids.map((id) => [id, "Online" as const])));
      }),
  );

  const first = batcher.request(["a"]);
  tick();
  const second = batcher.request(["a"]);
  tick();
  release();
  await Promise.all([first, second]);

  assert.deepEqual(calls, [["a"]]);
});

test("a settled id can be asked for again later (a reconnect re-snapshots)", async () => {
  const { batcher, calls, tick } = harness();

  const first = batcher.request(["a"]);
  tick();
  await first;
  const again = batcher.request(["a"]);
  tick();
  await again;

  assert.deepEqual(calls, [["a"], ["a"]]);
});

test("a failed call rejects every asker whose ids it carried, and delivers nothing", async () => {
  const { batcher, delivered, tick } = harness(async () => {
    throw new Error("Presence query rate limit exceeded. Retry later.");
  });

  const list = batcher.request(["a", "b"]);
  const dot = batcher.request(["b"]);
  tick();

  await assert.rejects(list, /rate limit/);
  await assert.rejects(dot, /rate limit/);
  assert.deepEqual(delivered, []);
});

test("an invoke that throws synchronously still rejects instead of stranding the askers", async () => {
  const { batcher, tick } = harness(() => {
    throw new Error("connection is not in the Connected state");
  });

  const pending = batcher.request(["a"]);
  tick();

  await assert.rejects(pending, /Connected/);
});

test("more ids than one call may carry are split, never truncated", async () => {
  const { batcher, calls, tick } = harness();
  const ids = Array.from({ length: PRESENCE_IDS_PER_CALL + 1 }, (_, i) => `u${i}`);

  const pending = batcher.request(ids);
  tick();
  await pending;

  assert.deepEqual(
    calls.map((call) => call.length),
    [PRESENCE_IDS_PER_CALL, 1],
  );
});
