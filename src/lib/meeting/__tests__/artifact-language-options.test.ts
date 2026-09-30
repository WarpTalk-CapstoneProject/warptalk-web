/**
 * The summary and minutes language pickers offer what the meeting can be written in (WT-703),
 * not every language the product knows — offering the rest is what made them look broken.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { artifactLanguageOptions } from "../artifact-language-options.ts";

const codes = (options: { code: string }[]) => options.map((option) => option.code);

test("a demo-workspace meeting (en → en, vi) offers exactly English and Vietnamese", () => {
  assert.deepEqual(codes(artifactLanguageOptions(["en", "vi"])).sort(), ["en", "vi"]);
});

test("locale tags from the server fold to the codes the picker sends", () => {
  assert.deepEqual(codes(artifactLanguageOptions(["vi-VN", "en_US"])).sort(), ["en", "vi"]);
});

test("no list from the server offers every product language — the server still enforces", () => {
  const all = codes(artifactLanguageOptions(undefined));
  assert.ok(all.includes("ja"));
  assert.ok(all.includes("vi"));
  assert.ok(all.length >= 6);
  assert.deepEqual(codes(artifactLanguageOptions(null)), all);
});

test("an empty list offers nothing new", () => {
  assert.deepEqual(artifactLanguageOptions([]), []);
});

test("the language on screen and stored readings stay selectable", () => {
  // A Japanese rendering generated before WT-703 is still readable, and a select whose value is
  // missing from its options renders blank.
  const options = codes(artifactLanguageOptions(["en", "vi"], ["ja", "", null]));
  assert.deepEqual(options.sort(), ["en", "ja", "vi"]);
});

test("a meeting language the product list does not carry is still offered", () => {
  const options = artifactLanguageOptions(["en", "pt"]);
  assert.deepEqual(codes(options).sort(), ["en", "pt"]);
});
