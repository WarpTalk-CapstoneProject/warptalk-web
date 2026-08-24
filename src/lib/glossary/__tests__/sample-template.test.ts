import assert from "node:assert/strict";
import { test, describe } from "node:test";

import {
  SAMPLE_TEMPLATE_HEADER,
  buildSampleTemplateRows,
  describeExpectedPair,
} from "../sample-template.ts";

/** Everything in the Translation column, sample rows only. */
function translations(rows: string[][]): string[] {
  return rows.slice(1).map((row) => row[1]);
}

describe("WT-522 — the template follows the glossary's own languages", () => {
  test("an English → English glossary is never handed Vietnamese", () => {
    // The reported bug, and the whole point. A "Gaming Sport (en → en)" glossary downloaded the
    // template and got Vietnamese football vocabulary; 93 of its 94 terms came back Vietnamese.
    const rows = buildSampleTemplateRows("en", "en");

    for (const value of translations(rows)) {
      assert.doesNotMatch(value, /việt vị|bắn trúng đầu/);
      // Vietnamese diacritics at all — a stronger check than naming the two old strings.
      assert.doesNotMatch(value, /[ạảãáàăâđêôơư]/i);
    }
  });

  test("a same-language glossary is told to describe, not translate", () => {
    const rows = buildSampleTemplateRows("en", "en");
    const text = rows.flat().join(" ").toLowerCase();

    assert.match(text, /describe|means/);
  });

  test("English → Vietnamese still gets the real pair it always had", () => {
    // The fix must not throw away a genuine sample that was correct for its own pair.
    assert.deepEqual(translations(buildSampleTemplateRows("en", "vi")), [
      "việt vị",
      "bắn trúng đầu",
    ]);
  });

  test("a pair we have no sample for gets a placeholder, never an invented word", () => {
    const rows = buildSampleTemplateRows("en", "ja");

    for (const value of translations(rows)) {
      assert.match(value, /^</, "must be visibly a placeholder");
      assert.match(value, /Japanese/);
    }
  });

  test("the placeholder for a same-language pair asks for a meaning", () => {
    const rows = buildSampleTemplateRows("ja", "ja");
    assert.match(translations(rows)[0], /means/i);
  });

  test("region subtags are the same language", () => {
    assert.deepEqual(
      buildSampleTemplateRows("en-US", "vi-VN"),
      buildSampleTemplateRows("en", "vi"),
    );
    assert.deepEqual(buildSampleTemplateRows("EN", "en"), buildSampleTemplateRows("en", "en"));
  });

  test("the header is always first and always the importer's own column names", () => {
    for (const pair of [["en", "vi"], ["en", "en"], ["ko", "th"], [null, null]] as const) {
      const rows = buildSampleTemplateRows(pair[0], pair[1]);
      assert.deepEqual(rows[0], [...SAMPLE_TEMPLATE_HEADER]);
      assert.ok(rows.length > 1, "a template with no sample row teaches nothing");
    }
  });

  test("every row has exactly as many cells as the header", () => {
    // A short row shifts every column after it when the importer reads the file.
    for (const pair of [["en", "vi"], ["en", "en"], ["en", "ja"]] as const) {
      for (const row of buildSampleTemplateRows(pair[0], pair[1])) {
        assert.equal(row.length, SAMPLE_TEMPLATE_HEADER.length);
      }
    }
  });

  test("a glossary with no languages recorded still produces a usable file", () => {
    const rows = buildSampleTemplateRows(null, undefined);
    assert.deepEqual(rows[0], [...SAMPLE_TEMPLATE_HEADER]);
    assert.ok(rows.length > 1);
  });
});

describe("WT-522 — what the dialog tells the reader", () => {
  test("it names the pair, so the sample is not the only instruction", () => {
    const said = describeExpectedPair("en", "vi");
    assert.match(said, /English/);
    assert.match(said, /Vietnamese/);
  });

  test("a same-language glossary is explained rather than described as a translation", () => {
    const said = describeExpectedPair("en", "en");
    assert.match(said, /means/i);
    assert.doesNotMatch(said, /should be English\./);
  });

  test("nothing is claimed when the glossary records no languages", () => {
    assert.equal(describeExpectedPair(null, null), "");
    assert.equal(describeExpectedPair("", undefined), "");
  });
});
