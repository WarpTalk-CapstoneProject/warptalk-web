import assert from "node:assert/strict";
import test from "node:test";

import { describeCloneCapture } from "../clone-capture-state.ts";

/**
 * WT-420 — the voice clone says what it is doing.
 *
 * The worker knew all of this and logged it. On 15 Aug the team concluded cloning was broken
 * while `score: 1.0` was being written to a log nobody in a meeting can read.
 */

test("nothing known shows nothing, rather than a false idle claim", () => {
  const view = describeCloneCapture(null);
  assert.equal(view.tone, "idle");
  assert.equal(view.title, "");
});

test("capture fills a bar from the numbers the worker sent", () => {
  const view = describeCloneCapture({ speakerId: "s1", reason: "capturing", seconds: 5, requiredSeconds: 10 });

  assert.equal(view.tone, "working");
  assert.equal(view.progress, 0.5);
  assert.match(view.detail, /5s of 10s/);
});

test("a missing required duration does not divide by zero", () => {
  // Infinity here renders a bar that overflows its own track.
  const view = describeCloneCapture({ speakerId: "s1", reason: "capturing", seconds: 5, requiredSeconds: 0 });
  assert.equal(view.progress, null);
});

test("progress never exceeds a full bar", () => {
  const view = describeCloneCapture({ speakerId: "s1", reason: "capturing", seconds: 25, requiredSeconds: 10 });
  assert.equal(view.progress, 1);
});

test("an accepted clip is graded, not just confirmed", () => {
  assert.equal(describeCloneCapture({ speakerId: "s1", reason: "cloning", score: 0.97 }).quality, "good");
  assert.equal(describeCloneCapture({ speakerId: "s1", reason: "cloning", score: 0.6 }).quality, "fair");
  assert.equal(describeCloneCapture({ speakerId: "s1", reason: "cloning", score: 0.2 }).quality, "weak");
});

test("a clone with no score reports no grade rather than the worst one", () => {
  assert.equal(describeCloneCapture({ speakerId: "s1", reason: "cloning" }).quality, null);
});

test("each refusal names its own fix", () => {
  // "too quiet" is a microphone, "clipped" is a gain setting, "too little speech" is a room.
  // One generic message would collapse three different conversations into a shrug.
  const quiet = describeCloneCapture({ speakerId: "s1", reason: "clip_rejected:too quiet" });
  const clipped = describeCloneCapture({ speakerId: "s1", reason: "clip_rejected:clipped" });

  assert.equal(quiet.tone, "blocked");
  assert.match(quiet.detail, /microphone/i);
  assert.match(clipped.detail, /gain/i);
  assert.notEqual(quiet.detail, clipped.detail);
});

test("an unmapped refusal still names its cause", () => {
  // A reason somebody added upstream. Printing it is how they learn this table needs a row;
  // swallowing it reproduces the exact silence this module removes.
  const view = describeCloneCapture({ speakerId: "s1", reason: "clip_rejected:some new gate" });
  assert.match(view.detail, /some new gate/);
});

test("having no audience is not reported as a failure", () => {
  // The most common state in a single-language room, and the one the whole team read as a bug.
  const view = describeCloneCapture({ speakerId: "s1", reason: "no_route_for_speaker" });

  assert.equal(view.tone, "idle", "a normal state was dressed up as an error");
  assert.match(view.detail, /Nobody is listening in another language/);
});

test("not having opted in points at the control that fixes it", () => {
  const view = describeCloneCapture({ speakerId: "s1", reason: "not_opted_in" });
  assert.equal(view.tone, "blocked");
  assert.match(view.detail, /My voice/);
});

test("translation not running says so instead of blaming the microphone", () => {
  for (const reason of ["no_routes", "routes_unknown"]) {
    const view = describeCloneCapture({ speakerId: "s1", reason });
    assert.equal(view.tone, "idle");
    assert.match(view.detail, /Start translation/);
  }
});

test("an unrecognised state is surfaced rather than swallowed", () => {
  const view = describeCloneCapture({ speakerId: "s1", reason: "some_future_state" });
  assert.match(view.detail, /some_future_state/);
});
