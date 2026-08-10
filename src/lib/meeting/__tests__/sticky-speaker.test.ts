import assert from "node:assert/strict";
import { test } from "node:test";

import {
  INITIAL_STICKY_SPEAKER,
  SPEAKER_HOLD_MS,
  nextStickySpeaker,
  type StickySpeakerState,
} from "../sticky-speaker.ts";

/**
 * The large tile used to follow LiveKit's active-speaker list directly, so a one-word
 * acknowledgement swapped the layout and swapped it straight back. These pin the rules that
 * stop that without making the stage feel dead.
 */

function run(
  state: StickySpeakerState,
  steps: Array<{ speaking: string[]; at: number }>,
): StickySpeakerState {
  return steps.reduce(
    (current, step) => nextStickySpeaker(current, step.speaking, step.at),
    state,
  );
}

test("the first person to speak takes the stage immediately", () => {
  const result = nextStickySpeaker(INITIAL_STICKY_SPEAKER, ["alice"], 0);
  assert.equal(result.focused, "alice");
});

test("a brief interjection does not steal the stage", () => {
  // Bob says "mm" for 300ms while Alice is mid-sentence.
  const focused = { focused: "alice", candidate: null, candidateSince: 0 };
  const after = run(focused, [
    { speaking: ["bob"], at: 1000 },
    { speaking: ["bob"], at: 1300 },
    { speaking: ["alice"], at: 1600 },
  ]);

  assert.equal(after.focused, "alice", "a 300ms noise took the stage");
});

test("someone who genuinely takes the floor gets it", () => {
  const focused = { focused: "alice", candidate: null, candidateSince: 0 };
  const after = run(focused, [
    { speaking: ["bob"], at: 1000 },
    { speaking: ["bob"], at: 1000 + SPEAKER_HOLD_MS },
  ]);

  assert.equal(after.focused, "bob");
});

test("the hold clock restarts if the contender stops partway", () => {
  const focused = { focused: "alice", candidate: null, candidateSince: 0 };
  const after = run(focused, [
    { speaking: ["bob"], at: 0 },
    { speaking: ["bob"], at: 1500 },
    { speaking: ["alice"], at: 1600 },
    { speaking: ["bob"], at: 1700 },
    { speaking: ["bob"], at: 2600 },
  ]);

  // Bob has spoken for 1500ms then 900ms, but never 2000ms in one turn.
  assert.equal(after.focused, "alice");
});

test("silence holds the last speaker rather than reshuffling", () => {
  const focused = { focused: "alice", candidate: null, candidateSince: 0 };
  const after = nextStickySpeaker(focused, [], 5000);
  assert.equal(after.focused, "alice");
});

test("the speaker keeps the stage for as long as they keep talking", () => {
  let state: StickySpeakerState = { focused: "alice", candidate: null, candidateSince: 0 };
  for (let at = 0; at < 60_000; at += 500) {
    state = nextStickySpeaker(state, ["alice"], at);
  }
  assert.equal(state.focused, "alice");
});

test("two people talking over each other does not flip the stage back and forth", () => {
  // The exact complaint: alternating turns produced a layout that jumped every time.
  let state: StickySpeakerState = { focused: "alice", candidate: null, candidateSince: 0 };
  const flips: string[] = [];
  for (let i = 0; i < 20; i += 1) {
    const speaker = i % 2 === 0 ? "bob" : "alice";
    const previous = state.focused;
    state = nextStickySpeaker(state, [speaker], i * 400);
    if (state.focused !== previous) flips.push(`${previous}->${state.focused}`);
  }
  assert.equal(flips.length, 0, `stage moved ${flips.length} times: ${flips.join(", ")}`);
});
