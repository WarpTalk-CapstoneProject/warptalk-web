/**
 * WT-582 — every suggestion must ASK WarpBot for something.
 *
 * The reported bug was not a model failure. "This came up in our meeting and went unanswered:
 * Nói cái gì vậy?" states a fact and requests nothing, so WarpBot acknowledged the fact. It
 * answered exactly what it was sent.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CATEGORY_ACTIONS,
  GENERIC_ACTIONS,
  IMPERATIVE_OPENERS,
  MAX_ACTIONS,
  actionsFor,
  replyLanguageFor,
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

test("no more than MAX_ACTIONS reach the card", () => {
  for (const category of Object.keys(CATEGORY_ACTIONS)) {
    assert.ok(actionsFor({ category, content: SUBJECT, detail: DETAIL }).length <= MAX_ACTIONS);
  }
});

// Reported: an action item offered only "Draft this task", so the hint could hand WarpBot a task
// and nothing else — no research, no plan.
test("an action item can be planned and researched, not only drafted", () => {
  const ids = actionsFor({ category: "action", content: SUBJECT, detail: DETAIL }).map((a) => a.id);
  for (const id of ["draftTask", "planExecution", "researchHowTo"]) {
    assert.ok(ids.includes(id), `action suggestions are missing ${id}`);
  }
});

test("every category offers more than one step", () => {
  for (const category of [...Object.keys(CATEGORY_ACTIONS), "something-new"]) {
    assert.ok(actionsFor({ category, content: SUBJECT }).length >= 2, `${category} offers one step`);
  }
});

// Reported: an English reader pressed an English button under a Vietnamese suggestion and got a
// Vietnamese ask card back. The prompt now names the reply language from the reader's locale.
test("every prompt names the reader's language, and English when the locale is unknown", () => {
  for (const [locale, language] of [["en", "English"], ["vi", "Vietnamese"], ["ja", "Japanese"], ["ja-JP", "Japanese"], ["fr", "English"], [undefined, "English"]] as const) {
    for (const action of actionsFor({ category: "action", content: SUBJECT, detail: DETAIL }, locale)) {
      assert.ok(action.prompt.endsWith(`Reply in ${language}, including any questions you ask me — even where the meeting quote above is in another language.`), `${locale}: ${action.id}`);
    }
  }
  assert.equal(replyLanguageFor(null), "English");
});

// WT-922. The card prints `t(\`actions.${id}\`)`, not `label`, so the reader sees the button in
// their interface language. An id with no entry renders the raw key path on the button — exactly
// the kind of slip that only shows up on screen, in the one language nobody tested.
const MESSAGES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "messages");

function suggestionCatalog(locale: string): {
  categories: Record<string, { label: string; meaning: string }>;
  actions: Record<string, string>;
} {
  return JSON.parse(readFileSync(join(MESSAGES, locale, "meetingTranscript.json"), "utf8")).suggestion;
}

test("every action id has a button label in every interface language", () => {
  // Deduplicated by identity: one shared action (Research this) is offered in several categories.
  const ids = [...new Set([...GENERIC_ACTIONS, ...Object.values(CATEGORY_ACTIONS).flat()])].map((action) => action.id);
  assert.equal(new Set(ids).size, ids.length, "two actions share an id, so one of them shows the other's label");
  for (const locale of ["en", "vi", "ja"]) {
    const { actions } = suggestionCatalog(locale);
    for (const id of ids) {
      assert.ok(actions[id]?.trim(), `messages/${locale}/meetingTranscript.json has no suggestion.actions.${id}`);
    }
  }
});

test("the English catalog says what the English source text says", () => {
  // `label` is kept as the source of truth the prompts were reviewed against; the catalog must
  // not drift from it in the source locale.
  const { actions } = suggestionCatalog("en");
  for (const action of [...GENERIC_ACTIONS, ...Object.values(CATEGORY_ACTIONS).flat()]) {
    assert.equal(actions[action.id], action.label);
  }
});

test("every category the card can show has a label and a meaning, including the fallback", () => {
  for (const locale of ["en", "vi", "ja"]) {
    const { categories } = suggestionCatalog(locale);
    for (const category of [...Object.keys(CATEGORY_ACTIONS), "other"]) {
      assert.ok(categories[category]?.label?.trim(), `${locale}: suggestion.categories.${category}.label`);
      assert.ok(categories[category]?.meaning?.trim(), `${locale}: suggestion.categories.${category}.meaning`);
    }
  }
});
