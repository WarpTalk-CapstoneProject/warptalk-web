import test from "node:test";
import assert from "node:assert/strict";

import {
  MENTION_MENU_LIMIT,
  mentionMatches,
  mentionMenuHandlesKey,
} from "./mention-menu.ts";

test("the menu offers WarpBot for an empty query and for a prefix", () => {
  assert.deepEqual(
    mentionMatches("").map((agent) => agent.display),
    ["WarpBot"],
  );
  assert.deepEqual(
    mentionMatches("warp").map((agent) => agent.display),
    ["WarpBot"],
  );
  assert.deepEqual(mentionMatches("zzz"), []);
});

test("matching ignores case and surrounding space", () => {
  assert.equal(mentionMatches("  WARPB ").length, 1);
});

test("the menu never returns more than it can show", () => {
  assert.ok(mentionMatches("").length <= MENTION_MENU_LIMIT);
});

test("Enter and Tab belong to the menu while it has something to offer", () => {
  // The whole point of Tab is not having to type the name out.
  assert.equal(mentionMenuHandlesKey("Enter", 1), true);
  assert.equal(mentionMenuHandlesKey("Tab", 1), true);
});

test("with nothing to offer the menu keeps its hands off", () => {
  // Swallowing Enter over a "No agents found" box makes the composer feel broken: the
  // message neither sends nor gains a mention. The menu used to claim Enter regardless.
  assert.equal(mentionMenuHandlesKey("Enter", 0), false);
  assert.equal(mentionMenuHandlesKey("Tab", 0), false);
});

test("every other key stays with the composer", () => {
  for (const key of ["a", "Escape", "ArrowUp", "Backspace", " "]) {
    assert.equal(mentionMenuHandlesKey(key, 1), false, `${key} was taken`);
  }
});
