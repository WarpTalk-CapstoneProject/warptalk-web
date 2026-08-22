/**
 * The in-meeting WarpBot trail, which must read the same as the widget's.
 *
 * One agent, two surfaces. The widget has shown a folded trail under every answer since it
 * shipped — which tools that reply came through, in order — while the meeting chat kept a single
 * live trail pinned to the bottom of the panel that belonged to whichever question was asked
 * last. Scrolling back through a meeting showed no record at all.
 */

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { useTranslationRoomStore } from "../translationRoom-store.ts";
import {
  REASONING_STEP,
  THINKING_STEP,
  WRITING_STEP,
} from "../../lib/meeting/assistant-tool-labels.ts";

const store = () => useTranslationRoomStore.getState();

beforeEach(() => {
  useTranslationRoomStore.getState().reset();
});

// ── the turn opens on a step, not on a spinner ───────────────────────────────

test("a turn that starts without naming a tool opens on 'reading your question'", () => {
  store().noteAssistantActivity();

  const steps = store().assistantSteps;
  assert.equal(steps.length, 1);
  assert.equal(steps[0].tool, THINKING_STEP);
  assert.equal(steps[0].done, false);
});

test("a turn that starts WITH a tool does not invent a thinking step in front of it", () => {
  // The first thing heard was a real tool call, so that is what was happening.
  store().noteAssistantActivity("search_terminology", "C#");

  const steps = store().assistantSteps;
  assert.equal(steps.length, 1);
  assert.equal(steps[0].tool, "search_terminology");
});

test("the opening step is finished by the first real tool call", () => {
  store().noteAssistantActivity();
  store().noteAssistantActivity("search_terminology", "C#");

  const steps = store().assistantSteps;
  assert.equal(steps.length, 2);
  assert.equal(steps[0].tool, THINKING_STEP);
  assert.equal(steps[0].done, true, "two steps must never spin at once");
  assert.equal(steps[1].done, false);
});

// ── sealing the trail onto the answer ────────────────────────────────────────

test("the finished trail is attached to the answer it produced", () => {
  store().noteAssistantActivity();
  store().noteAssistantActivity("search_terminology", "C#");
  store().noteAssistantReasoning("Checking the glossary", "Nothing there for C#.");

  store().sealAssistantTrail("msg-1");

  const trail = store().assistantTrails["msg-1"];
  assert.ok(trail, "the answer must carry its own trail");
  assert.deepEqual(
    trail.steps.map((step) => step.tool),
    [THINKING_STEP, "search_terminology", REASONING_STEP, WRITING_STEP],
  );
});

test("every step in a sealed trail is finished", () => {
  store().noteAssistantActivity();
  store().noteAssistantActivity("web_search", "microsoft.com");
  store().sealAssistantTrail("msg-1");

  assert.ok(
    store().assistantTrails["msg-1"].steps.every((step) => step.done),
    "a step still marked running would spin forever under a finished answer",
  );
});

test("sealing clears the live trail, so it is not drawn twice", () => {
  store().noteAssistantActivity("search_terminology", "C#");
  store().sealAssistantTrail("msg-1");

  assert.equal(store().assistantSteps.length, 0);
});

test("the answer records how long the turn took", () => {
  store().noteAssistantActivity();
  store().sealAssistantTrail("msg-1");

  const { durationMs } = store().assistantTrails["msg-1"];
  assert.ok(durationMs !== null && durationMs >= 0);
});

// ── the ways sealing must refuse ─────────────────────────────────────────────

test("a second arrival of the same answer does not erase its trail", () => {
  // The hub delivers the reply, then a reconnect backfills history and delivers it again. By
  // then the live array is empty, so an unguarded reseal would blank what the first one kept.
  store().noteAssistantActivity("search_terminology", "C#");
  store().sealAssistantTrail("msg-1");
  const first = store().assistantTrails["msg-1"];

  store().sealAssistantTrail("msg-1");

  assert.equal(store().assistantTrails["msg-1"], first);
});

test("an answer that arrived with no trail behind it gets no empty one", () => {
  store().sealAssistantTrail("msg-1");

  assert.equal(store().assistantTrails["msg-1"], undefined);
});

test("a nameless message is not sealed onto", () => {
  store().noteAssistantActivity("search_terminology", "C#");
  store().sealAssistantTrail("");

  assert.equal(Object.keys(store().assistantTrails).length, 0);
  assert.equal(store().assistantSteps.length, 1, "the live trail must survive a failed seal");
});

// ── one turn does not disturb another ────────────────────────────────────────

test("a second question starts a fresh trail and leaves the first answer's alone", () => {
  store().noteAssistantActivity();
  store().noteAssistantActivity("get_transcript", "Hieu clone");
  store().sealAssistantTrail("msg-1");
  store().setAssistantState("idle");

  store().noteAssistantActivity();
  store().noteAssistantActivity("web_search", "learn.microsoft.com");

  assert.deepEqual(
    store().assistantTrails["msg-1"].steps.map((step) => step.tool),
    [THINKING_STEP, "get_transcript", WRITING_STEP],
  );
  assert.deepEqual(
    store().assistantSteps.map((step) => step.tool),
    [THINKING_STEP, "web_search"],
  );
});

test("the tool's own target is carried through to the sealed trail", () => {
  // Never derived here: a target this client guessed at would be a claim about what the agent
  // did, made by something that cannot know.
  store().noteAssistantActivity("web_search", "learn.microsoft.com");
  store().sealAssistantTrail("msg-1");

  const searched = store().assistantTrails["msg-1"].steps.find(
    (step) => step.tool === "web_search",
  );
  assert.equal(searched?.detail, "learn.microsoft.com");
});
