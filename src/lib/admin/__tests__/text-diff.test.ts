import assert from "node:assert/strict";
import { test } from "node:test";

import { collapseUnchanged, diffLines, diffStats } from "../text-diff.ts";

test("an unchanged text diffs to nothing but same lines", () => {
  assert.deepEqual(diffStats(diffLines("a\nb", "a\nb")), { added: 0, removed: 0 });
});

test("a changed line is one removal and one addition, in place", () => {
  const lines = diffLines("<p>Hello</p>\n<a>Join</a>\n<p>Bye</p>", "<p>Hello</p>\n<a>Join now</a>\n<p>Bye</p>");
  assert.deepEqual(lines, [
    { op: "same", text: "<p>Hello</p>" },
    { op: "removed", text: "<a>Join</a>" },
    { op: "added", text: "<a>Join now</a>" },
    { op: "same", text: "<p>Bye</p>" },
  ]);
});

test("added and removed from empty", () => {
  assert.deepEqual(diffStats(diffLines("", "a\nb")), { added: 2, removed: 0 });
  assert.deepEqual(diffStats(diffLines("a\nb", "")), { added: 0, removed: 2 });
});

test("long unchanged runs collapse around the change", () => {
  const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
  const after = before.replace("line 10", "line ten");
  const collapsed = collapseUnchanged(diffLines(before, after), 2);
  const gaps = collapsed.filter((line) => line.op === "gap");
  assert.equal(gaps.length, 2);
  assert.equal(collapsed.filter((line) => line.op === "same").length, 4);
});
