import assert from "node:assert/strict";
import { test } from "node:test";

import { headerState, parseListView, prune, toggleAll, toggleOne } from "../cms-selection.ts";

test("rows toggle one at a time", () => {
  assert.deepEqual(toggleOne([], "a"), ["a"]);
  assert.deepEqual(toggleOne(["a", "b"], "a"), ["b"]);
});

test("select all ticks the visible rows, then clears only them", () => {
  assert.deepEqual(toggleAll(["x"], ["a", "b"]), ["x", "a", "b"]);
  assert.deepEqual(toggleAll(["x", "a", "b"], ["a", "b"]), ["x"]);
  assert.equal(headerState(["a"], ["a", "b"]), "some");
  assert.equal(headerState(["a", "b"], ["a", "b"]), "all");
  assert.equal(headerState([], ["a"]), "none");
});

test("a selection never keeps rows the filter hid", () => {
  const selected = ["a", "b"];
  assert.equal(prune(selected, ["a", "b", "c"]), selected);
  assert.deepEqual(prune(selected, ["b"]), ["b"]);
});

test("the view toggle defaults to cards", () => {
  assert.equal(parseListView("table"), "table");
  assert.equal(parseListView(null), "cards");
  assert.equal(parseListView("grid"), "cards");
});
