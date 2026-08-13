import assert from "node:assert/strict";
import test from "node:test";
import { mapWithLimit } from "../map-with-limit.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("results come back in input order, not completion order", async () => {
  // Reversed delays: the last item finishes first.
  const items = [4, 3, 2, 1];
  const results = await mapWithLimit(items, 4, async (item) => {
    for (let i = 0; i < item; i++) await tick();
    return item * 10;
  });
  assert.deepEqual(results, [40, 30, 20, 10]);
});

test("never exceeds the concurrency limit", async () => {
  let inFlight = 0;
  let peak = 0;
  await mapWithLimit(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await tick();
    inFlight--;
  });
  assert.equal(peak, 3);
});

test("every item runs exactly once", async () => {
  const seen: number[] = [];
  await mapWithLimit(Array.from({ length: 50 }, (_, i) => i), 7, async (item) => {
    await tick();
    seen.push(item);
  });
  assert.equal(seen.length, 50);
  assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: 50 }, (_, i) => i));
});

test("it is concurrent, not serial", async () => {
  // 8 items at limit 4 is two waves; serial execution would be eight.
  let maxObserved = 0;
  let inFlight = 0;
  await mapWithLimit(Array.from({ length: 8 }, (_, i) => i), 4, async () => {
    inFlight++;
    maxObserved = Math.max(maxObserved, inFlight);
    await tick();
    await tick();
    inFlight--;
  });
  assert.ok(maxObserved > 1, "tasks must overlap");
});

test("an empty list does no work and returns nothing", async () => {
  let called = false;
  const results = await mapWithLimit([], 4, async () => {
    called = true;
  });
  assert.deepEqual(results, []);
  assert.equal(called, false);
});

test("a limit larger than the list, or a nonsense limit, still runs every item", async () => {
  for (const limit of [100, 1, 0, -5, 2.7]) {
    const results = await mapWithLimit([1, 2, 3], limit, async (n) => n * 2);
    assert.deepEqual(results, [2, 4, 6], `limit ${limit}`);
  }
});

test("index is passed through", async () => {
  const results = await mapWithLimit(["a", "b", "c"], 2, async (item, index) => `${index}:${item}`);
  assert.deepEqual(results, ["0:a", "1:b", "2:c"]);
});
