/**
 * WT-582 — every suggestion must ASK WarpBot for something.
 *
 * The reported bug was not a model failure. "This came up in our meeting and went unanswered:
 * Nói cái gì vậy?" states a fact and requests nothing, so WarpBot acknowledged the fact. It
 * answered exactly what it was sent.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CATEGORY_ACTIONS,
  GENERIC_ACTIONS,
  IMPERATIVE_OPENERS,
  actionsFor,
} from "../suggestion-actions.ts";

const SUBJECT = "Nói cái gì vậy?";
const DETAIL = "said while discussing the voice cloning demo";

function everyPrompt(): { label: string; prompt: string }[] {
  const all = [...GENERIC_ACTIONS, ...Object.values(CATEGORY_ACTIONS).flat()];
  return all.map((action) => ({
    label: action.label,
    prompt: action.prompt(SUBJECT, DETAIL),
  }));
}

test("every prompt opens with an imperative — a remark gets a remark back", () => {
  for (const { label, prompt } of everyPrompt()) {
    const firstWord = prompt.trimStart().split(/[\s:]/)[0];
    assert.ok(
      (IMPERATIVE_OPENERS as readonly string[]).includes(firstWord ?? ""),
      `"${label}" starts with "${firstWord}", which asks for nothing. `
        + `That is the WT-582 defect: WarpBot replies by restating the observation.`,
    );
  }
});

test("no prompt merely narrates that something happened", () => {
  // The exact shapes that shipped broken, kept as strings so a rewrite cannot quietly restore them.
  for (const { label, prompt } of everyPrompt()) {
    assert.ok(
      !prompt.startsWith("This came up in our meeting"),
      `"${label}" narrates instead of asking`,
    );
    assert.ok(!prompt.startsWith("About our meeting"), `"${label}" is a topic label, not a request`);
  }
});

test("the unanswered-question action tells WarpBot where to look, and in what order", () => {
  const [ask] = actionsFor({ category: "clarification", content: SUBJECT, detail: DETAIL });
  assert.ok(ask);
  // An unanswered question is exactly the case where the transcript does NOT hold the answer, so
  // stopping there is the failure. Each later source has to be named or the honest reply is still
  // "the meeting does not say".
  for (const source of ["transcript", "documents", "own knowledge"]) {
    assert.match(ask.prompt, new RegExp(source, "i"));
  }
});

test("it asks WarpBot to say what the answer rests on", () => {
  const [ask] = actionsFor({ category: "clarification", content: SUBJECT, detail: DETAIL });
  assert.match(ask!.prompt, /rests on/i);
});

test("it offers a way out that is not a fabricated answer", () => {
  const [ask] = actionsFor({ category: "clarification", content: SUBJECT, detail: DETAIL });
  assert.match(ask!.prompt, /would settle it/i);
});

test("context is attached when there is some, and nothing dangles when there is not", () => {
  const [withDetail] = actionsFor({ category: "clarification", content: SUBJECT, detail: DETAIL });
  assert.match(withDetail!.prompt, /Context: /);

  const [without] = actionsFor({ category: "clarification", content: SUBJECT, detail: "" });
  assert.ok(!without!.prompt.includes("Context:"));
});

test("an unknown category still gets a real request rather than nothing", () => {
  const [action] = actionsFor({ category: "something-new", content: SUBJECT });
  assert.ok(action);
  assert.match(action.prompt, /^Answer this/);
});

test("no more than two actions reach the card", () => {
  for (const category of Object.keys(CATEGORY_ACTIONS)) {
    assert.ok(actionsFor({ category, content: SUBJECT, detail: DETAIL }).length <= 2);
  }
});
