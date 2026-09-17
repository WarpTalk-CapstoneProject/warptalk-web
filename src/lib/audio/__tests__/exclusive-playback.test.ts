/**
 * Voice Profiles played every pressed clip at once. One slot, and a press takes it.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { claimPlayback } from "../exclusive-playback.ts";

test("a second claim stops the first", () => {
  const stopped: string[] = [];
  const a = claimPlayback(() => stopped.push("a"));
  const b = claimPlayback(() => stopped.push("b"));

  assert.deepEqual(stopped, ["a"]);
  assert.equal(a.isCurrent(), false);
  assert.equal(b.isCurrent(), true);
  b.release();
});

test("a clip still loading is superseded before it can play", () => {
  // Press A (fetch in flight), press B: A's response must find itself no longer current.
  const a = claimPlayback(() => {});
  const b = claimPlayback(() => {});
  assert.equal(a.isCurrent(), false, "A must not start when its fetch lands");
  b.release();
});

test("a superseded claim releasing does not free the new holder's slot", () => {
  const stopped: string[] = [];
  const a = claimPlayback(() => stopped.push("a"));
  const b = claimPlayback(() => stopped.push("b"));
  a.release(); // A's onended / unmount firing late
  const c = claimPlayback(() => stopped.push("c"));

  assert.deepEqual(stopped, ["a", "b"], "B still held the slot and must be stopped by C");
  assert.equal(b.isCurrent(), false);
  c.release();
});

test("after release, the next claim stops nobody", () => {
  const stopped: string[] = [];
  const a = claimPlayback(() => stopped.push("a"));
  a.release();
  const b = claimPlayback(() => stopped.push("b"));

  assert.deepEqual(stopped, []);
  b.release();
});

test("the stopped claimant already reads as superseded inside its own stop", () => {
  let currentDuringStop: boolean | null = null;
  const a = claimPlayback(() => {
    currentDuringStop = a.isCurrent();
  });
  const b = claimPlayback(() => {});

  assert.equal(currentDuringStop, false);
  b.release();
});
