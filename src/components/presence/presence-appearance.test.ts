import assert from "node:assert/strict";
import { test } from "node:test";

import { PRESENCE_DOT_CLASSES, PRESENCE_LABELS } from "./presence-appearance.ts";

/**
 * Presence has three states and they must look like three things.
 *
 * "In a meeting" was previously drawn as Online plus a 2px inset ring, on the reasoning that
 * it is a kind of online — which at 8px rendered as a smudge, so someone mid-meeting appeared
 * available. Anything that collapses two states into one appearance again should fail here
 * rather than on somebody's screen.
 */

test("every presence state is visually distinct from every other", () => {
  const seen = new Map<string, string>();
  for (const [state, className] of Object.entries(PRESENCE_DOT_CLASSES)) {
    const clash = seen.get(className);
    assert.equal(clash, undefined, `${state} looks identical to ${clash}`);
    seen.set(className, state);
  }
});

test("in-meeting is red, which is what busy means everywhere else", () => {
  assert.match(PRESENCE_DOT_CLASSES.InMeeting, /bg-red/);
  assert.ok(!/emerald|green/.test(PRESENCE_DOT_CLASSES.InMeeting), PRESENCE_DOT_CLASSES.InMeeting);
});

test("online stays green, so the meaning of the colour does not move", () => {
  assert.match(PRESENCE_DOT_CLASSES.Online, /bg-emerald/);
});

test("offline is a filled grey, not an empty outline that reads as still loading", () => {
  assert.match(PRESENCE_DOT_CLASSES.Offline, /bg-ink-subtle/);
  assert.ok(!/bg-transparent/.test(PRESENCE_DOT_CLASSES.Offline), PRESENCE_DOT_CLASSES.Offline);
});

test("every state has a label, so the dot is never colour-only", () => {
  for (const state of Object.keys(PRESENCE_DOT_CLASSES)) {
    const label = PRESENCE_LABELS[state as keyof typeof PRESENCE_LABELS];
    assert.ok(label && label.length > 0, `${state} has no label`);
  }
});
