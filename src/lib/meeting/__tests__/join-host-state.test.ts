/**
 * Learning the lock and the recording from the join response (WT-935).
 *
 * The mistakes worth pinning: treating a field an older backend never sent as `false`, and letting
 * a snapshot that was in flight undo a broadcast that arrived after it was taken.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { hydrateFromJoin, readJoinHostState } from "../join-host-state.ts";

test("reads both fields when the join response carries them", () => {
  assert.deepEqual(readJoinHostState({ locked: true, recording: true }), {
    locked: true,
    recording: true,
  });
  assert.deepEqual(readJoinHostState({ locked: false, recording: false }), {
    locked: false,
    recording: false,
  });
});

test("an absent field is 'did not say', never false", () => {
  assert.deepEqual(readJoinHostState({}), { locked: null, recording: null });
  assert.deepEqual(readJoinHostState({ recording: true }), { locked: null, recording: true });
  assert.deepEqual(readJoinHostState(null), { locked: null, recording: null });
  assert.deepEqual(readJoinHostState(undefined), { locked: null, recording: null });
});

test("a field of the wrong type is 'did not say'", () => {
  assert.deepEqual(readJoinHostState({ locked: "true", recording: 1 }), {
    locked: null,
    recording: null,
  });
  assert.deepEqual(readJoinHostState({ locked: null, recording: null }), {
    locked: null,
    recording: null,
  });
});

test("a reload into a recorded meeting shows it as recording", () => {
  assert.equal(hydrateFromJoin({ current: false, joined: true, toldWhileJoining: false }), true);
});

test("a rejoin corrects a state whose broadcast was missed", () => {
  assert.equal(hydrateFromJoin({ current: true, joined: false, toldWhileJoining: false }), false);
});

test("an older backend that does not send the field leaves the state alone", () => {
  assert.equal(hydrateFromJoin({ current: true, joined: null, toldWhileJoining: false }), true);
  assert.equal(hydrateFromJoin({ current: false, joined: null, toldWhileJoining: false }), false);
});

test("a broadcast that landed while the join was in flight is not undone by the snapshot", () => {
  // Stopped during the rejoin: the snapshot still says "recording".
  assert.equal(hydrateFromJoin({ current: false, joined: true, toldWhileJoining: true }), false);
  // Started during the join: the snapshot still says "not recording".
  assert.equal(hydrateFromJoin({ current: true, joined: false, toldWhileJoining: true }), true);
});

test("agreeing sources change nothing", () => {
  assert.equal(hydrateFromJoin({ current: true, joined: true, toldWhileJoining: true }), true);
  assert.equal(hydrateFromJoin({ current: false, joined: false, toldWhileJoining: false }), false);
});
