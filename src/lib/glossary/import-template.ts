/**
 * WT-880 — the glossary import template is a FILE SHAPE, not a pack of terms.
 *
 * WHAT THE PO DECIDED (2026-10-02), AND WHAT THIS FILE THEREFORE IS
 *   - A template is a header row plus columns grouped Source / Target / General. It carries no
 *     domain vocabulary: the domain of a term is a VALUE in its row (the Field column).
 *   - The file is built per language PAIR from per-language blocks. Source-group columns take the
 *     source language's sample values, Target-group columns the target language's, General-group
 *     columns the source language's. EN→VI to EN→JA changes only the Target group — there are N
 *     language blocks, never N² templates.
 *   - The file has one faint sample row (no "Guide" sheet) and the importer skips it.
 *   - The platform admin configures all of it (group, order, hidden, name, aliases, samples) on
 *     /admin/global-glossary → Import template; TranscriptService stores it. This module is the
 *     pure half both screens and the importer share: layout, header aliases, parsing.
 *
 * WHY THE IMPORTER STILL READS OLD FILES
 *   LEGACY_HEADER_ALIASES is the importer's alias table from before this change, verbatim, and
 *   the admin's names/aliases are layered on top of it. A spreadsheet somebody built against the
 *   old "Term, Translation, …" sample keeps importing whatever the admin renames.
 *
 * Kept free of React and of the `@/` alias so the node:test contract can import it directly.
 */

// Relative, with the extension: these contract tests run under `node --experimental-strip-types`
// with no bundler, so the `@/` alias does not resolve.
import { getLanguageName } from "../language/languages.ts";
import type {
  ImportTemplateColumn,
  ImportTemplateColumnKey,
  ImportTemplateGroup,
  ImportTemplateSamples,
} from "../../types/glossary-import-template.ts";

export type {
  ImportTemplateColumn,
  ImportTemplateColumnKey,
  ImportTemplateGroup,
  ImportTemplateSamples,
} from "../../types/glossary-import-template.ts";

/** One parsed row, in the shape the bulk endpoint takes. */
export interface ParsedGlossaryRow {
  sourceTerm: string;
  targetTerm: string;
  context?: string | null;
  domain?: string | null;
  definition?: string | null;
  usageNote?: string | null;
  partOfSpeech?: string | null;
  priority?: number;
}

export interface ImportTemplateConfig {
  columns: ImportTemplateColumn[];
  samples: ImportTemplateSamples;
}

/** File order: Source, then Target, then General. */
export const IMPORT_TEMPLATE_GROUPS: readonly ImportTemplateGroup[] = ["source", "target", "general"];

export const IMPORT_TEMPLATE_COLUMN_KEYS: readonly ImportTemplateColumnKey[] = [
  "sourceTerm",
  "context",
  "partOfSpeech",
  "targetTerm",
  "usageNote",
  "domain",
  "definition",
  "priority",
];

/** The two columns the importer cannot do without; they cannot be hidden or regrouped. */
export const REQUIRED_COLUMNS: Record<"sourceTerm" | "targetTerm", ImportTemplateGroup> = {
  sourceTerm: "source",
  targetTerm: "target",
};

/**
 * The configuration before any admin touched it — and the offline fallback when the template
 * endpoint cannot be read. TranscriptService serves the same thing from
 * GlossaryImportTemplateDefaults.cs; change both together.
 *
 * Groups (PO decisions 2026-10-02): Source = Term, Context, Part of speech; Target = Translation,
 * Definition, Note; General = Field, Priority. Definition is a Target column because it is written
 * in the target language — "Bug" in an EN→JA glossary is defined in Japanese, in EN→EN in English.
 *
 * Samples are the PO's own example: in a JA–VI/EN engineering meeting "Bug" must reach the
 * Japanese listener as 不具合, not 虫 (insect).
 */
export const DEFAULT_IMPORT_TEMPLATE: ImportTemplateConfig = {
  columns: [
    { key: "sourceTerm", group: "source", order: 0, hidden: false, name: "Term", aliases: ["source term", "sourceterm", "source"] },
    // i18n-allow: Vietnamese header aliases the importer has always accepted (not UI copy).
    { key: "context", group: "source", order: 1, hidden: false, name: "Context", aliases: ["usage context", "context sentence", "example", "example sentence", "ngữ cảnh", "ngu canh", "câu ví dụ", "ví dụ"] },
    { key: "partOfSpeech", group: "source", order: 2, hidden: false, name: "Part of speech", aliases: ["partofspeech", "pos"] },
    { key: "targetTerm", group: "target", order: 0, hidden: false, name: "Translation", aliases: ["target term", "targetterm", "target", "translate as"] },
    { key: "definition", group: "target", order: 1, hidden: false, name: "Definition", aliases: ["meaning"] },
    { key: "usageNote", group: "target", order: 2, hidden: false, name: "Note", aliases: ["usage note", "usagenote"] },
    { key: "domain", group: "general", order: 0, hidden: false, name: "Field", aliases: ["domain", "business domain"] },
    { key: "priority", group: "general", order: 1, hidden: false, name: "Priority", aliases: [] },
  ],
  samples: {
    en: {
      sourceTerm: "Bug",
      context: "We need to fix this bug before the Sprint 14 release.",
      partOfSpeech: "noun",
      targetTerm: "Bug",
      definition: "A defect in software that causes wrong behaviour",
      usageNote: "Used in engineering meetings",
      domain: "Software engineering",
      priority: "5",
    },
    // i18n-allow: sample VALUES of the file, i.e. genuine language data, not interface copy.
    vi: {
      sourceTerm: "lỗi phần mềm",
      context: "Chúng ta cần fix gấp Bug này trước khi release Sprint 14.",
      partOfSpeech: "danh từ",
      targetTerm: "lỗi phần mềm",
      definition: "Sai sót trong phần mềm khiến chương trình chạy sai",
      usageNote: "Kỹ sư thường nói tắt là \"bug\"",
      domain: "Kỹ thuật phần mềm",
      priority: "5",
    },
    // i18n-allow: sample VALUES of the file, i.e. genuine language data, not interface copy.
    ja: {
      sourceTerm: "不具合",
      context: "リリース前にこの不具合を修正する必要があります。",
      partOfSpeech: "名詞",
      targetTerm: "不具合",
      definition: "ソフトウェアの欠陥や誤動作",
      usageNote: "「ソフトウェア障害」とも言う",
      domain: "ソフトウェア工学",
      priority: "5",
    },
  },
};

/**
 * The importer's header aliases from before WT-880, lowercased, kept so every file made against
 * the old fixed header still imports. The admin's configuration is layered over these.
 */
// i18n-allow: Vietnamese column aliases supported by the spreadsheet importer.
export const LEGACY_HEADER_ALIASES: Readonly<Record<string, ImportTemplateColumnKey>> = {
  term: "sourceTerm",
  "source term": "sourceTerm",
  sourceterm: "sourceTerm",
  source: "sourceTerm",
  translation: "targetTerm",
  "target term": "targetTerm",
  targetterm: "targetTerm",
  target: "targetTerm",
  "translate as": "targetTerm",
  context: "context",
  "usage context": "context",
  "context sentence": "context",
  "ngữ cảnh": "context",
  "ngu canh": "context",
  "câu ví dụ": "context",
  "ví dụ": "context",
  example: "context",
  "example sentence": "context",
  domain: "domain",
  field: "domain",
  "business domain": "domain",
  definition: "definition",
  meaning: "definition",
  note: "usageNote",
  "usage note": "usageNote",
  usagenote: "usageNote",
  "part of speech": "partOfSpeech",
  partofspeech: "partOfSpeech",
  priority: "priority",
};

/** `en-US`, `EN` and `en_us` are all `en`. */
export function baseLanguage(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

/**
 * How a header cell is compared: trimmed, lowercased, inner whitespace collapsed, and one trailing
 * "(…)" dropped — the file says "Term (English)" and the importer must read "term". Mirrors
 * GlossaryImportTemplateRules.NormalizeHeader in TranscriptService.
 */
export function normalizeHeader(value: string | null | undefined): string {
  const text = (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const stripped = text.replace(/\s*\([^()]*\)\s*$/, "").trim();
  return stripped.length === 0 ? text : stripped;
}

/** Visible and hidden columns, Source → Target → General, each group by `order`. */
export function orderedColumns(columns: readonly ImportTemplateColumn[]): ImportTemplateColumn[] {
  return columns
    .map((column, position) => ({ column, position }))
    .sort((a, b) => {
      const group =
        IMPORT_TEMPLATE_GROUPS.indexOf(a.column.group) - IMPORT_TEMPLATE_GROUPS.indexOf(b.column.group);
      if (group !== 0) return group;
      if (a.column.order !== b.column.order) return a.column.order - b.column.order;
      return a.position - b.position;
    })
    .map(({ column }) => column);
}

/** Renumbers `order` 0..n-1 within each group, in display order. */
export function renumberColumns(columns: readonly ImportTemplateColumn[]): ImportTemplateColumn[] {
  const counters: Record<ImportTemplateGroup, number> = { source: 0, target: 0, general: 0 };
  return orderedColumns(columns).map((column) => ({ ...column, order: counters[column.group]++ }));
}

/** Header text (normalized) → column. Legacy aliases first, the admin's configuration over them. */
export function buildHeaderAliases(
  columns: readonly ImportTemplateColumn[],
): Map<string, ImportTemplateColumnKey> {
  const aliases = new Map<string, ImportTemplateColumnKey>(Object.entries(LEGACY_HEADER_ALIASES));
  for (const column of columns) {
    for (const label of [column.name, ...column.aliases]) {
      const key = normalizeHeader(label);
      if (key) aliases.set(key, column.key);
    }
  }
  return aliases;
}

type LanguageNamer = (code: string) => string;

const defaultNamer: LanguageNamer = (code) => getLanguageName(code);

export interface ImportTemplateBand {
  group: ImportTemplateGroup;
  /** The language this group is written in; empty for General or an unknown language. */
  language: string;
  /** How many columns the band spans. */
  span: number;
}

export interface ImportTemplateLayout {
  sourceLanguage: string;
  targetLanguage: string;
  /** The visible columns, in file order. */
  columns: ImportTemplateColumn[];
  /** One band per group that has at least one visible column. */
  bands: ImportTemplateBand[];
  /** The header row as written in the file. */
  header: string[];
  /** The faint sample row. */
  sample: string[];
}

function placeholder(
  key: ImportTemplateColumnKey,
  languageName: string,
  sameLanguage: boolean,
): string {
  // Angle brackets so it is unmistakably an instruction, never a plausible-looking wrong word —
  // and so the importer can recognise and skip it (WT-522: never invent a translation).
  if (key === "sourceTerm") return languageName ? `<term in ${languageName}>` : "<term>";
  if (key === "targetTerm") {
    if (sameLanguage) return `<what this term means, in ${languageName}>`;
    return languageName ? `<translation in ${languageName}>` : "<translation>";
  }
  return "";
}

/**
 * The file for one language pair: which columns, under which group band, with what header text
 * and sample values.
 *
 * Each value comes from the block of the language its group is written in (Source and General:
 * the source language; Target: the target language). A block that lacks a value falls back to the
 * English block's text (PO, 2026-10-02) — except Term and Translation, which never borrow another
 * language's word: they get a visible `<…>` placeholder instead (WT-522).
 *
 * A same-language pair (en → en) is a terminology list: Translation repeats the term and the
 * Definition column, written in that same language, says what it means (PO example:
 * `Bug | Bug | A defect in software that causes wrong behaviour`).
 */
export function buildImportTemplateLayout(
  config: ImportTemplateConfig,
  sourceLanguage: string | null | undefined,
  targetLanguage: string | null | undefined,
  nameOf: LanguageNamer = defaultNamer,
): ImportTemplateLayout {
  const source = baseLanguage(sourceLanguage);
  const target = baseLanguage(targetLanguage);
  const sameLanguage = Boolean(source) && source === target;
  const sourceName = source ? nameOf(source) : "";
  const targetName = target ? nameOf(target) : "";
  const sourceSamples = (source && config.samples[source]) || {};
  const targetSamples = (target && config.samples[target]) || {};

  const columns = orderedColumns(config.columns).filter((column) => !column.hidden);

  const header = columns.map((column) => {
    const language = column.group === "source" ? sourceName : column.group === "target" ? targetName : "";
    return language ? `${column.name} (${language})` : column.name;
  });

  const english = config.samples.en ?? {};
  const sample = columns.map((column) => {
    const isTarget = column.group === "target";
    const own = (isTarget ? targetSamples : sourceSamples)[column.key]?.trim();
    if (own) return own;
    if (column.key === "sourceTerm" || column.key === "targetTerm") {
      return placeholder(column.key, isTarget ? targetName : sourceName, isTarget && sameLanguage);
    }
    return english[column.key]?.trim() || "";
  });

  const bands: ImportTemplateBand[] = [];
  for (const column of columns) {
    const last = bands[bands.length - 1];
    if (last && last.group === column.group) {
      last.span += 1;
    } else {
      bands.push({
        group: column.group,
        language: column.group === "source" ? source : column.group === "target" ? target : "",
        span: 1,
      });
    }
  }

  return { sourceLanguage: source, targetLanguage: target, columns, bands, header, sample };
}

/** Header + faint sample row, the rows a CSV download holds. */
export function importTemplateCsv(layout: ImportTemplateLayout): string {
  return [layout.header, layout.sample]
    // Quote everything and double any embedded quote: a value legitimately containing a comma
    // would otherwise produce a sample file the importer itself misreads.
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}

export function importTemplateFileName(layout: ImportTemplateLayout, extension: "xlsx" | "csv"): string {
  const pair = [layout.sourceLanguage, layout.targetLanguage].filter(Boolean).join("-");
  return `warptalk-glossary-template${pair ? `-${pair}` : ""}.${extension}`;
}

/** A cell that is one of the template's own `<…>` instructions. */
export function isPlaceholder(value: string): boolean {
  return /^<[^<>]*>$/.test(value.trim());
}

/**
 * Every (term, translation) any sample row of this configuration can show, so the importer can
 * recognise a sample row whichever pair the file was downloaded for.
 */
export function knownSamplePairs(config: ImportTemplateConfig): { terms: Set<string>; translations: Set<string> } {
  const terms = new Set<string>();
  const translations = new Set<string>();
  for (const values of Object.values(config.samples)) {
    if (values.sourceTerm?.trim()) terms.add(values.sourceTerm.trim());
    if (values.targetTerm?.trim()) translations.add(values.targetTerm.trim());
  }
  return { terms, translations };
}

const MAX_HEADER_SCAN_ROWS = 10;

/**
 * WT-505: the header row is FOUND, not assumed to be row 1 — real spreadsheets open with a title,
 * an export timestamp, or (now) the template's own group band. Bounded to the first few rows:
 * beyond that, scanning would start matching a stray cell in the body.
 */
export function findHeaderRow(
  matrix: string[][],
  aliases: Map<string, ImportTemplateColumnKey>,
): { index: number; columns: (ImportTemplateColumnKey | undefined)[] } | null {
  const limit = Math.min(matrix.length, MAX_HEADER_SCAN_ROWS);
  for (let index = 0; index < limit; index += 1) {
    const columns = (matrix[index] ?? []).map((cell) => aliases.get(normalizeHeader(cell)));
    if (columns.includes("sourceTerm") && columns.includes("targetTerm")) {
      return { index, columns };
    }
  }
  return null;
}

export interface ParseOptions {
  /** Header aliases (see buildHeaderAliases). */
  aliases: Map<string, ImportTemplateColumnKey>;
  /** Sample values of the configuration, to recognise the sample row. */
  samples?: { terms: Set<string>; translations: Set<string> };
  /** Matrix row indices whose cells carry the template's faint sample-row style (xlsx only). */
  styledSampleRows?: ReadonlySet<number>;
}

export interface ParseResult {
  rows: ParsedGlossaryRow[];
  /** A wrong FILE, not a wrong row: no Term or no Translation column. */
  error?: "missingColumns";
  /** The template's sample row was found and left out. */
  skippedSample: boolean;
}

/**
 * The rows of a sheet, header found by alias.
 *
 * The template's sample row is skipped — only ever the FIRST data row, and only when it is
 * recognisably the sample: styled as one (xlsx), a `<…>` placeholder, or exactly the sample term
 * and translation of the configuration. A user who typed their own first row over it keeps it.
 */
export function parseGlossaryMatrix(matrix: string[][], options: ParseOptions): ParseResult {
  const found = findHeaderRow(matrix, options.aliases);
  const columns = found?.columns ?? [];
  const termIndex = columns.indexOf("sourceTerm");
  const translationIndex = columns.indexOf("targetTerm");
  if (!found || termIndex === -1 || translationIndex === -1) {
    return { rows: [], error: "missingColumns", skippedSample: false };
  }

  const rows: ParsedGlossaryRow[] = [];
  let skippedSample = false;
  let firstDataRow = true;
  for (let rowIndex = found.index + 1; rowIndex < matrix.length; rowIndex += 1) {
    const raw = matrix[rowIndex] ?? [];
    const sourceTerm = (raw[termIndex] ?? "").trim();
    const targetTerm = (raw[translationIndex] ?? "").trim();
    // A blank line in the middle of a spreadsheet is punctuation, not data.
    if (!sourceTerm && !targetTerm) continue;

    if (firstDataRow) {
      firstDataRow = false;
      const isSample =
        options.styledSampleRows?.has(rowIndex) ||
        isPlaceholder(sourceTerm) ||
        isPlaceholder(targetTerm) ||
        Boolean(
          options.samples?.terms.has(sourceTerm) && options.samples.translations.has(targetTerm),
        );
      if (isSample) {
        skippedSample = true;
        continue;
      }
    }

    const row: ParsedGlossaryRow = { sourceTerm, targetTerm };
    columns.forEach((field, index) => {
      if (!field || field === "sourceTerm" || field === "targetTerm") return;
      const value = (raw[index] ?? "").trim();
      if (!value) return;
      if (field === "priority") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) row.priority = parsed;
        return;
      }
      row[field] = value;
    });
    rows.push(row);
  }

  return { rows, skippedSample };
}

/** Optional translator, defaulted to English so the node:test contract keeps working. */
type ExpectedPairTranslator = (
  key: "expectedPairSame" | "expectedPairDifferent",
  values: { source: string; target: string },
) => string;

const DEFAULT_EXPECTED_PAIR_COPY = {
  expectedPairSame: ({ source, target }: { source: string; target: string }) =>
    `This glossary is ${source} → ${target}, so the second column is what each term means rather than a translation.`,
  expectedPairDifferent: ({ source, target }: { source: string; target: string }) =>
    `This glossary is ${source} → ${target}. The second column should be ${target}.`,
};

/** WT-522: what the import dialog says the file is expected to contain. */
export function describeExpectedPair(
  sourceLanguage: string | null | undefined,
  targetLanguage: string | null | undefined,
  t: ExpectedPairTranslator = (key, values) => DEFAULT_EXPECTED_PAIR_COPY[key](values),
): string {
  const source = baseLanguage(sourceLanguage);
  const target = baseLanguage(targetLanguage);
  if (!source && !target) return "";

  const sourceName = getLanguageName(source || undefined);
  const targetName = getLanguageName(target || undefined);

  return t(source && source === target ? "expectedPairSame" : "expectedPairDifferent", {
    source: sourceName,
    target: targetName,
  });
}

/**
 * Coerces whatever the endpoint answered into a usable configuration: every column key present
 * exactly once (a missing one comes back with its default), samples keyed by base language.
 * Keeps the template working if the server and this build disagree about a key.
 */
export function normalizeImportTemplateConfig(
  input: Partial<ImportTemplateConfig> | null | undefined,
): ImportTemplateConfig {
  const byKey = new Map<ImportTemplateColumnKey, ImportTemplateColumn>();
  for (const column of input?.columns ?? []) {
    if (!column || !IMPORT_TEMPLATE_COLUMN_KEYS.includes(column.key) || byKey.has(column.key)) continue;
    if (!IMPORT_TEMPLATE_GROUPS.includes(column.group)) continue;
    byKey.set(column.key, { ...column, aliases: Array.isArray(column.aliases) ? column.aliases : [] });
  }
  for (const fallback of DEFAULT_IMPORT_TEMPLATE.columns) {
    if (!byKey.has(fallback.key)) byKey.set(fallback.key, { ...fallback, order: Number.MAX_SAFE_INTEGER });
  }

  const samples: ImportTemplateSamples = {};
  for (const [code, values] of Object.entries(input?.samples ?? {})) {
    const language = baseLanguage(code);
    if (!language || !values) continue;
    samples[language] = { ...samples[language], ...values };
  }

  return {
    columns: renumberColumns([...byKey.values()]),
    samples: input?.samples ? samples : DEFAULT_IMPORT_TEMPLATE.samples,
  };
}
