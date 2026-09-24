import assert from "node:assert/strict";
import { test } from "node:test";

import { insertBlock, prefixLines, wrapSelection } from "../markdown-format.ts";

test("bold wraps the selection and toggles back off", () => {
  const on = wrapSelection("make this bold", 10, 14, "**", "**", "text");
  assert.equal(on.value, "make this **bold**");
  assert.deepEqual([on.selectionStart, on.selectionEnd], [12, 16]);
  const off = wrapSelection(on.value, on.selectionStart, on.selectionEnd, "**", "**", "text");
  assert.equal(off.value, "make this bold");
});

test("with nothing selected a placeholder is inserted and selected", () => {
  const edit = wrapSelection("ab", 1, 1, "[", "](https://)", "link text");
  assert.equal(edit.value, "a[link text](https://)b");
  assert.equal(edit.value.slice(edit.selectionStart, edit.selectionEnd), "link text");
});

test("list prefixes apply to every touched line and toggle off together", () => {
  const value = "one\ntwo\nthree";
  const on = prefixLines(value, 2, 6, "- ");
  assert.equal(on.value, "- one\n- two\nthree");
  assert.equal(prefixLines(on.value, 0, 10, "- ").value, value);
  assert.equal(prefixLines(value, 0, value.length, (i) => `${i + 1}. `).value, "1. one\n2. two\n3. three");
});

test("an image lands on its own paragraph", () => {
  assert.equal(insertBlock("Intro", 5, "![a](/x)").value, "Intro\n\n![a](/x)");
  assert.equal(insertBlock("", 0, "![a](/x)").value, "![a](/x)");
  assert.equal(insertBlock("A\n\nB", 3, "![a](/x)").value, "A\n\n![a](/x)\n\nB");
});
