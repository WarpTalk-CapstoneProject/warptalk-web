import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  ALL_PAIRS,
  filterAfterPairChange,
  glossaryPairKey,
  groupGlossariesByPair,
  pairEditorLanguageOptions,
} from "../glossary-pairs.ts";

const names: Record<string, string> = { en: "English", vi: "Vietnamese", ja: "Japanese" };
const nameOf = (code: string) => names[code] ?? code;

const g = (id: string, sourceLanguage: string, targetLanguage: string) => ({ id, sourceLanguage, targetLanguage });
const glossaries = [
  g("it", "en", "en"),
  g("gaming", "en", "en"),
  g("legal", "en", "vi"),
  g("bug-ja", "en", "ja"),
  g("twelve", "en-US", "EN"),
];

describe("PO 2026-10-02 — glossary chips grouped and filtered by language pair", () => {
  test("one group per pair, ordered by source then target name, with counts", () => {
    const result = groupGlossariesByPair(glossaries, ALL_PAIRS, nameOf, null);
    assert.deepEqual(
      result.options.map((option) => [option.key, option.count]),
      [["en>en", 3], ["en>ja", 1], ["en>vi", 1]],
    );
    assert.deepEqual(result.groups[0].glossaries.map((x) => x.id), ["it", "gaming", "twelve"]);
  });

  test("the pair is one unit and region subtags do not split it", () => {
    assert.equal(glossaryPairKey(g("x", "en-US", "vi_VN")), "en>vi");
    assert.notEqual(glossaryPairKey(g("x", "en", "vi")), glossaryPairKey(g("x", "vi", "en")));
  });

  test("filtering keeps only that pair's glossaries", () => {
    const result = groupGlossariesByPair(glossaries, "en>vi", nameOf, null);
    assert.deepEqual(result.groups.map((group) => group.key), ["en>vi"]);
    assert.equal(result.selected?.id, "legal");
    // The filter never hides a pair from the options.
    assert.equal(result.options.length, 3);
  });

  test("a selected glossary filtered out gives way to the first visible one", () => {
    assert.equal(groupGlossariesByPair(glossaries, "en>ja", nameOf, "it").selected?.id, "bug-ja");
    assert.equal(groupGlossariesByPair(glossaries, ALL_PAIRS, nameOf, "legal").selected?.id, "legal");
  });

  test("a glossary whose pair changed moves to its new group at once", () => {
    const moved = glossaries.map((x) => (x.id === "it" ? { ...x, targetLanguage: "vi" } : x));
    const result = groupGlossariesByPair(moved, ALL_PAIRS, nameOf, "it");
    assert.deepEqual(result.groups.find((group) => group.key === "en>vi")?.glossaries.map((x) => x.id), ["it", "legal"]);
    assert.equal(result.selected?.id, "it");
  });

  test("a filter naming a pair that no longer exists falls back to all pairs", () => {
    const result = groupGlossariesByPair(glossaries, "ja>vi", nameOf, null);
    assert.equal(result.filter, ALL_PAIRS);
    assert.equal(result.groups.length, 3);
  });

  test("no glossaries: nothing to select", () => {
    const result = groupGlossariesByPair([], ALL_PAIRS, nameOf, "x");
    assert.equal(result.selected, undefined);
    assert.deepEqual(result.options, []);
  });
});

describe("WT-937 — changing the open glossary's pair keeps it open", () => {
  test("filtered to the old pair, the relabelled glossary stays selected instead of a neighbour", () => {
    const before = [g("it", "en", "en"), g("gaming", "en", "en"), g("twelve", "en", "en")];
    const opened = groupGlossariesByPair(before, "en>en", nameOf, "twelve");
    assert.equal(opened.selected?.id, "twelve");

    // The editor relabels "twelve" as en>vi; "it" and "gaming" keep en>en alive as a pair.
    const after = [g("it", "en", "en"), g("gaming", "en", "en"), g("twelve", "en", "vi")];
    const filter = filterAfterPairChange(opened.filter, glossaryPairKey(after[2]));
    const view = groupGlossariesByPair(after, filter, nameOf, "twelve");

    assert.equal(filter, "en>vi");
    assert.equal(view.selected?.id, "twelve");
    assert.deepEqual(view.groups.map((group) => group.key), ["en>vi"]);
  });

  test("the old behaviour — keeping the filter — is exactly what swapped the glossary out", () => {
    const after = [g("it", "en", "en"), g("gaming", "en", "en"), g("twelve", "en", "vi")];
    assert.equal(groupGlossariesByPair(after, "en>en", nameOf, "twelve").selected?.id, "it");
  });

  test("All pairs stays All pairs", () => {
    assert.equal(filterAfterPairChange(ALL_PAIRS, "en>vi"), ALL_PAIRS);
  });
});

describe("the Change pair selects follow the workspace language policy", () => {
  const allowed = [{ code: "en", name: "English" }, { code: "vi", name: "Vietnamese" }];

  test("only the languages the workspace allows are offered", () => {
    assert.deepEqual(
      pairEditorLanguageOptions(allowed, ["en", "vi"], nameOf).map((option) => option.code),
      ["en", "vi"],
    );
  });

  test("a language the glossary already holds stays listed after the policy dropped it", () => {
    assert.deepEqual(pairEditorLanguageOptions(allowed, ["en-US", "ja"], nameOf), [
      { code: "en", name: "English" },
      { code: "vi", name: "Vietnamese" },
      { code: "ja", name: "Japanese" },
    ]);
  });
});
