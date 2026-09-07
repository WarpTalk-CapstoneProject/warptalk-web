/**
 * WT-580 — the rule that decides whether a chat message waits for WarpBot.
 *
 * The bug being pinned is the one that would be easiest to reintroduce: holding an ordinary
 * message to the humans in the room because a language model happens to be busy.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_QUEUED_AGENT_ASKS, decideAgentSend } from "../assistant-queue.ts";

test("a message to the room never waits on WarpBot", () => {
  for (const assistantBusy of [true, false]) {
    for (const queueLength of [0, MAX_QUEUED_AGENT_ASKS + 5]) {
      assert.equal(
        decideAgentSend({ asksTheAgent: false, assistantBusy, queueLength }),
        "send",
        "human chat must never be held — a live meeting cannot queue behind a model",
      );
    }
  }
});

test("the first question goes straight out", () => {
  assert.equal(
    decideAgentSend({ asksTheAgent: true, assistantBusy: false, queueLength: 0 }),
    "send",
  );
});

test("a second question while the first is being answered is held — the reported bug", () => {
  assert.equal(
    decideAgentSend({ asksTheAgent: true, assistantBusy: true, queueLength: 0 }),
    "queue",
  );
});

test("a slow answer still counts as busy", () => {
  // "slow" is a notice that WarpBot is taking a while, not that it has given up — the answer
  // still arrives and still needs the conversation in order.
  assert.equal(
    decideAgentSend({ asksTheAgent: true, assistantBusy: true, queueLength: 1 }),
    "queue",
  );
});

test("the queue has a ceiling, and crossing it is refused rather than dropped", () => {
  assert.equal(
    decideAgentSend({
      asksTheAgent: true,
      assistantBusy: true,
      queueLength: MAX_QUEUED_AGENT_ASKS - 1,
    }),
    "queue",
  );
  assert.equal(
    decideAgentSend({
      asksTheAgent: true,
      assistantBusy: true,
      queueLength: MAX_QUEUED_AGENT_ASKS,
    }),
    "refuse",
  );
});

test("a full queue drains rather than latching", () => {
  // Once the assistant is idle again the ceiling stops applying: the queue is about ordering,
  // not about rationing.
  assert.equal(
    decideAgentSend({
      asksTheAgent: true,
      assistantBusy: false,
      queueLength: MAX_QUEUED_AGENT_ASKS,
    }),
    "send",
  );
});
