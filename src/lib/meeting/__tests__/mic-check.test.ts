import assert from "node:assert/strict";
import test from "node:test";

import {
  CLEAR_LEVEL,
  QUIET_LEVEL,
  SILENT_LEVEL,
  describeMicBackground,
} from "../mic-check.ts";

/**
 * The background floor is the mic check's whole verdict on noise suppression: what the
 * microphone sends when you are NOT speaking. These pin the two properties the drawing relies
 * on — the floor ignores the buckets you spoke in, and it refuses to judge from almost nothing.
 */

test("too few buckets is no verdict, not a wrong one", () => {
  assert.equal(describeMicBackground([]), null);
  assert.equal(describeMicBackground([0.5, 0.5, 0.5]), null);
});

test("speech buckets do not drag the floor up — the quietest recent bucket wins", () => {
  // A sentence spoken over a silent room: peaks high, floor silent. Averaging would call this
  // "noticeable" and accuse a working denoiser of doing nothing.
  const levels = [0.02, 0.7, 0.85, 0.6, 0.01, 0.02, 0.75, 0.03];
  const verdict = describeMicBackground(levels);
  assert.ok(verdict);
  assert.equal(verdict.label, "silent");
});

test("the floor is judged from the recent window, not the whole strip", () => {
  // A noisy start that suppression then cleaned up: 12 recent buckets are what count, so an old
  // loud stretch must not haunt the verdict after the strip has moved past it.
  const old = Array.from({ length: 24 }, () => 0.5);
  const recent = Array.from({ length: 12 }, () => 0.3);
  const verdict = describeMicBackground([...old, ...recent]);
  assert.ok(verdict);
  assert.equal(verdict.label, "noticeable");
});

test("each threshold maps to its label", () => {
  const at = (floor: number) =>
    describeMicBackground([floor, floor + 0.01, floor + 0.02, floor + 0.01])?.label;

  assert.equal(at(SILENT_LEVEL - 0.01), "silent");
  assert.equal(at(QUIET_LEVEL - 0.01), "low");
  assert.equal(at(CLEAR_LEVEL - 0.01), "noticeable");
  assert.equal(at(CLEAR_LEVEL + 0.1), "loud");
});
