import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_IMPORT_TEMPLATE,
  buildHeaderAliases,
  buildImportTemplateLayout,
  describeExpectedPair,
  importTemplateCsv,
  importTemplateFileName,
  knownSamplePairs,
  normalizeHeader,
  normalizeImportTemplateConfig,
  parseGlossaryMatrix,
  type ImportTemplateConfig,
} from "../import-template.ts";

const config = DEFAULT_IMPORT_TEMPLATE;
const parseOptions = (c: ImportTemplateConfig = config) => ({
  aliases: buildHeaderAliases(c.columns),
  samples: knownSamplePairs(c),
});

describe("WT-880 — a template is a file shape built per language pair", () => {
  test("the default groups are the ones the PO chose, in file order", () => {
    const layout = buildImportTemplateLayout(config, "en", "vi");
    assert.deepEqual(
      layout.bands.map((band) => [band.group, band.span]),
      [["source", 3], ["target", 3], ["general", 2]],
    );
    assert.deepEqual(layout.header, [
      "Term (English)",
      "Context (English)",
      "Part of speech (English)",
      "Translation (Vietnamese)",
      "Definition (Vietnamese)",
      "Note (Vietnamese)",
      "Field",
      "Priority",
    ]);
  });

  test("EN→VI to EN→JA changes only the Target group", () => {
    const vi = buildImportTemplateLayout(config, "en", "vi");
    const ja = buildImportTemplateLayout(config, "en", "ja");
    vi.columns.forEach((column, index) => {
      const same = vi.header[index] === ja.header[index] && vi.sample[index] === ja.sample[index];
      assert.equal(same, column.group !== "target", `${column.key} (${column.group})`);
    });
  });

  test("Source takes the source language's samples, Target the target's", () => {
    const layout = buildImportTemplateLayout(config, "vi", "en");
    const at = (key: string) => layout.sample[layout.columns.findIndex((c) => c.key === key)];
    assert.equal(at("sourceTerm"), config.samples.vi?.sourceTerm);
    assert.equal(at("targetTerm"), config.samples.en?.targetTerm);
    assert.equal(at("usageNote"), config.samples.en?.usageNote);
    // Definition is written in the TARGET language (PO, 2026-10-02).
    assert.equal(at("definition"), config.samples.en?.definition);
    // General follows the source language.
    assert.equal(at("domain"), config.samples.vi?.domain);
  });

  test("a hidden column is left out of the file; order inside a group is the admin's", () => {
    const edited: ImportTemplateConfig = {
      ...config,
      columns: config.columns.map((column) =>
        column.key === "partOfSpeech"
          ? { ...column, hidden: true }
          : column.key === "priority"
            ? { ...column, order: -1 }
            : column,
      ),
    };
    const layout = buildImportTemplateLayout(edited, "en", "vi");
    assert.ok(!layout.columns.some((column) => column.key === "partOfSpeech"));
    assert.deepEqual(
      layout.columns.filter((c) => c.group === "general").map((c) => c.key),
      ["priority", "domain"],
    );
  });

  test("a language with no samples gets a visible placeholder, never an invented word (WT-522)", () => {
    const layout = buildImportTemplateLayout(config, "en", "ko", (code) => (code === "ko" ? "Korean" : "English"));
    const translation = layout.sample[layout.columns.findIndex((c) => c.key === "targetTerm")];
    assert.equal(translation, "<translation in Korean>");
  });

  test("the PO's Bug example, per pair", () => {
    const row = (target: string) => {
      const layout = buildImportTemplateLayout(config, "en", target);
      const at = (key: string) => layout.sample[layout.columns.findIndex((c) => c.key === key)];
      return [at("sourceTerm"), at("targetTerm"), at("definition"), at("domain")];
    };
    assert.deepEqual(row("ja"), ["Bug", "不具合", "ソフトウェアの欠陥や誤動作", "Software engineering"]);
    assert.deepEqual(row("en"), ["Bug", "Bug", "A defect in software that causes wrong behaviour", "Software engineering"]);
    assert.deepEqual(row("vi"), ["Bug", "lỗi phần mềm", "Sai sót trong phần mềm khiến chương trình chạy sai", "Software engineering"]);
  });

  test("a block without a value falls back to English text, but never for Term/Translation", () => {
    const layout = buildImportTemplateLayout(config, "en", "ko", () => "Korean");
    const at = (key: string) => layout.sample[layout.columns.findIndex((c) => c.key === key)];
    assert.equal(at("definition"), config.samples.en?.definition);
    assert.equal(at("targetTerm"), "<translation in Korean>");
    const unknown = buildImportTemplateLayout(config, "ko", "ko", () => "Korean");
    assert.match(unknown.sample[unknown.columns.findIndex((c) => c.key === "targetTerm")], /means/);
  });

  test("an English → English template never carries Vietnamese (WT-522)", () => {
    const layout = buildImportTemplateLayout(config, "en", "en");
    assert.doesNotMatch(layout.sample.join(" "), /[ạảãáàăâđêôơư]/i);
  });

  test("region subtags are the same language", () => {
    assert.deepEqual(
      buildImportTemplateLayout(config, "en-US", "vi-VN"),
      buildImportTemplateLayout(config, "en", "vi"),
    );
  });

  test("header and sample row are always the same length, even with no languages", () => {
    for (const pair of [["en", "vi"], ["en", "en"], [null, null], ["ko", "th"]] as const) {
      const layout = buildImportTemplateLayout(config, pair[0], pair[1]);
      assert.equal(layout.header.length, layout.sample.length);
      assert.ok(layout.sample[0], "the term sample is never empty");
    }
  });

  test("the CSV is the header and the sample row, and the file name carries the pair", () => {
    const layout = buildImportTemplateLayout(config, "en", "vi");
    const lines = importTemplateCsv(layout).split("\r\n");
    assert.equal(lines.length, 2);
    assert.ok(lines[0].startsWith('"Term (English)"'));
    assert.equal(importTemplateFileName(layout, "xlsx"), "warptalk-glossary-template-en-vi.xlsx");
  });
});

describe("WT-880 — the importer reads the template, and still reads old files", () => {
  test("a downloaded template round-trips: the header is found and the sample row skipped", () => {
    const layout = buildImportTemplateLayout(config, "en", "vi");
    const bands = layout.bands.flatMap((band) => [`${band.group} · x`, ...Array(band.span - 1).fill("")]);
    // Term, Context, Part of speech | Translation, Definition, Note | Field, Priority
    const matrix = [bands, layout.header, layout.sample, ["refund", "", "", "hoàn tiền", "", "", "", "3"]];

    const result = parseGlossaryMatrix(matrix, parseOptions());

    assert.equal(result.error, undefined);
    assert.equal(result.skippedSample, true);
    assert.deepEqual(result.rows, [{ sourceTerm: "refund", targetTerm: "hoàn tiền", priority: 3 }]);
  });

  test("a file with the old fixed header still imports", () => {
    const matrix = [
      ["Term", "Translation", "Context", "Field", "Definition", "Note", "Part of speech", "Priority"],
      ["offside", "việt vị", "", "Football", "", "", "noun", "1"],
    ];
    const result = parseGlossaryMatrix(matrix, parseOptions());
    assert.equal(result.skippedSample, false);
    assert.deepEqual(result.rows, [
      { sourceTerm: "offside", targetTerm: "việt vị", domain: "Football", partOfSpeech: "noun", priority: 1 },
    ]);
  });

  test("an admin-renamed column and its alias are recognised, the legacy name too", () => {
    const renamed: ImportTemplateConfig = {
      ...config,
      columns: config.columns.map((column) =>
        column.key === "domain" ? { ...column, name: "Industry", aliases: ["sector"] } : column,
      ),
    };
    for (const header of ["Industry", "sector", "Field"]) {
      const result = parseGlossaryMatrix([["Term", "Translation", header], ["a", "b", "Retail"]], parseOptions(renamed));
      assert.equal(result.rows[0]?.domain, "Retail", header);
    }
  });

  test("a placeholder sample row is skipped; a real first row is kept", () => {
    const placeholderRow = parseGlossaryMatrix(
      [["Term", "Translation"], ["<term in Korean>", "<translation in Thai>"], ["a", "b"]],
      parseOptions(),
    );
    assert.equal(placeholderRow.skippedSample, true);
    assert.equal(placeholderRow.rows.length, 1);

    const realRow = parseGlossaryMatrix([["Term", "Translation"], ["Bug", "error"]], parseOptions());
    assert.equal(realRow.skippedSample, false, "only the configured sample pair counts as a sample");
    assert.equal(realRow.rows.length, 1);
  });

  test("only the first data row can be the sample", () => {
    const result = parseGlossaryMatrix(
      [["Term", "Translation"], ["a", "b"], ["Bug", "lỗi phần mềm"]],
      parseOptions(),
    );
    assert.equal(result.rows.length, 2);
  });

  test("an xlsx row styled as the sample is skipped whatever it says", () => {
    const result = parseGlossaryMatrix([["Term", "Translation"], ["x", "y"], ["a", "b"]], {
      ...parseOptions(),
      styledSampleRows: new Set([1]),
    });
    assert.equal(result.skippedSample, true);
    assert.deepEqual(result.rows.map((row) => row.sourceTerm), ["a"]);
  });

  test("a file with no Term/Translation header is a wrong file", () => {
    const result = parseGlossaryMatrix([["Word", "Meaning?"], ["a", "b"]], parseOptions());
    assert.equal(result.error, "missingColumns");
  });

  test("header comparison ignores case, spacing and the (Language) suffix", () => {
    assert.equal(normalizeHeader("  Translation   (Vietnamese) "), "translation");
    assert.equal(normalizeHeader("PART OF  SPEECH"), "part of speech");
  });
});

describe("WT-880 — a server answer is coerced into a usable configuration", () => {
  test("a missing column comes back with its default; unknown keys are dropped", () => {
    const normalized = normalizeImportTemplateConfig({
      columns: [
        { key: "sourceTerm", group: "source", order: 0, hidden: false, name: "Word", aliases: [] },
        // @ts-expect-error — a key this build does not know
        { key: "reading", group: "source", order: 1, hidden: false, name: "Reading", aliases: [] },
      ],
      samples: { "EN-us": { sourceTerm: "hello" } },
    });
    assert.equal(normalized.columns.length, DEFAULT_IMPORT_TEMPLATE.columns.length);
    assert.equal(normalized.columns[0].name, "Word");
    assert.equal(normalized.samples.en?.sourceTerm, "hello");
  });

  test("nothing at all is the default", () => {
    assert.deepEqual(normalizeImportTemplateConfig(null), {
      columns: DEFAULT_IMPORT_TEMPLATE.columns,
      samples: DEFAULT_IMPORT_TEMPLATE.samples,
    });
  });
});

describe("WT-522 — what the dialog tells the reader", () => {
  test("it names the pair", () => {
    const said = describeExpectedPair("en", "vi");
    assert.match(said, /English/);
    assert.match(said, /Vietnamese/);
  });

  test("a same-language glossary is explained rather than described as a translation", () => {
    assert.match(describeExpectedPair("en", "en"), /means/i);
  });

  test("nothing is claimed when the glossary records no languages", () => {
    assert.equal(describeExpectedPair(null, null), "");
  });
});
