import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESENCE_RETRY_AFTER_MS, presenceIdsToRequest } from "../retry.ts";

test("an id already requested is not asked for again", () => {
  assert.deepEqual(presenceIdsToRequest(["a", "b"], new Set(["a"]), new Map(), 0), ["b"]);
});

test("a failed id waits out the back-off instead of being re-asked on the next render", () => {
  const failures = new Map([["a", 1_000]]);
  assert.deepEqual(presenceIdsToRequest(["a"], new Set(), failures, 1_000 + 16), []);
  assert.deepEqual(presenceIdsToRequest(["a"], new Set(), failures, 1_000 + PRESENCE_RETRY_AFTER_MS - 1), []);
  assert.deepEqual(presenceIdsToRequest(["a"], new Set(), failures, 1_000 + PRESENCE_RETRY_AFTER_MS), ["a"]);
});
