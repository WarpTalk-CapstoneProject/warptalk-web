/**
 * The rows in the downloadable glossary template — for THIS glossary's languages.
 *
 * WT-522. The template was two hardcoded English→Vietnamese rows:
 *
 *     offside   → việt vị        (Football)
 *     headshot  → bắn trúng đầu  (Gaming)
 *
 * …handed to every glossary regardless of what language pair it was configured for. A workspace
 * created a **Gaming Sport (English → English)** glossary, downloaded the template, and got a file
 * demonstrating Vietnamese football and gaming vocabulary. 93 of its 94 terms came back Vietnamese.
 * The reported "hardcode EN → VI" is exactly that: the sample was the only instruction anyone was
 * given about what belongs in the file, and it said Vietnamese.
 *
 * Nothing validated it afterwards either — `GlossaryService.BulkImportTermsAsync` never reads
 * `glossary.SourceLanguage` or `TargetLanguage`, so whatever the file said went in.
 *
 * WHAT A SAME-LANGUAGE GLOSSARY IS FOR, since that is the case that broke
 *     `en → en` is not a mistake and not a no-op. It is a terminology list: the term, and what it
 *     MEANS, in one language. So its sample shows a definition rather than a translation, which is
 *     the thing a reader of that file needs to understand.
 *
 * NEVER INVENT A TRANSLATION
 *     Samples exist only for pairs we can actually write. For anything else the Translation column
 *     carries a visible placeholder naming the target language — a file that says
 *     `<translation in Japanese>` teaches the shape without asserting a word that may be wrong,
 *     and it cannot be imported by accident as if it were real vocabulary.
 */

// Relative, with the extension: these contract tests run under `node --experimental-strip-types`
// with no bundler, so the `@/` alias does not resolve (see store-imports contract).
import { getLanguageName } from "../language/languages.ts";

/** The header the importer's own aliases recognise. Kept beside the rows it labels. */
export const SAMPLE_TEMPLATE_HEADER = [
  "Term",
  "Translation",
  "Field",
  "Definition",
  "Note",
  "Part of speech",
  "Priority",
] as const;

type SampleRow = {
  term: string;
  translation: string;
  field: string;
  definition: string;
  note: string;
  partOfSpeech: string;
};

/** `en-US` and `EN` are the same language for this purpose. */
function baseLanguage(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

// i18n-allow: these are glossary ENTRIES, not interface copy — a sample has to demonstrate real
// vocabulary, which is the "genuine language data" exemption the English-UI contract allows for.
const GENUINE_SAMPLES: Record<string, SampleRow[]> = {
  "en>vi": [
    {
      term: "offside",
      translation: "việt vị",
      field: "Football",
      definition: "Attacker ahead of the last defender",
      note: "Common in match commentary",
      partOfSpeech: "noun",
    },
    {
      term: "headshot",
      translation: "bắn trúng đầu",
      field: "Gaming",
      definition: "A shot that hits the head",
      note: "",
      partOfSpeech: "noun",
    },
  ],
  // i18n-allow: the reverse pair, so the SOURCE column is genuinely Vietnamese here.
  "vi>en": [
    {
      term: "việt vị",
      translation: "offside",
      field: "Football",
      definition: "Cầu thủ tấn công đứng trên hậu vệ cuối cùng",
      note: "Hay gặp khi bình luận trận đấu",
      partOfSpeech: "noun",
    },
  ],
  // Same language: the "translation" column is what the term MEANS, not another word for it.
  "en>en": [
    {
      term: "offside",
      translation: "an attacker positioned ahead of the last defender",
      field: "Football",
      definition: "Called when the ball is played forward to them",
      note: "Same-language glossary: describe the term rather than translate it",
      partOfSpeech: "noun",
    },
    {
      term: "assist",
      translation: "the pass that directly sets up a goal",
      field: "Football",
      definition: "Credited to the passer, not the scorer",
      note: "",
      partOfSpeech: "noun",
    },
  ],
};

function placeholderSamples(
  sourceLanguage: string | null | undefined,
  targetLanguage: string | null | undefined,
): SampleRow[] {
  const source = baseLanguage(sourceLanguage);
  const target = baseLanguage(targetLanguage);
  const targetName = getLanguageName(target || undefined);
  const sameLanguage = Boolean(source) && source === target;

  return [
    {
      term: "your term here",
      // Angle brackets so it is unmistakably an instruction. A reader who imports this file
      // unchanged gets a row that is obviously wrong rather than a plausible-looking wrong word.
      translation: sameLanguage
        ? `<what this term means, in ${targetName}>`
        : `<translation in ${targetName}>`,
      field: "optional",
      definition: "optional",
      note: sameLanguage
        ? "Same-language glossary: describe the term rather than translate it"
        : "",
      partOfSpeech: "optional",
    },
  ];
}

/**
 * The sample rows for a glossary's own language pair, header first.
 *
 * Never empty: an empty template teaches nothing, and the header alone leaves the reader guessing
 * which column is which.
 */
export function buildSampleTemplateRows(
  sourceLanguage: string | null | undefined,
  targetLanguage: string | null | undefined,
): string[][] {
  const key = `${baseLanguage(sourceLanguage)}>${baseLanguage(targetLanguage)}`;
  const samples = GENUINE_SAMPLES[key] ?? placeholderSamples(sourceLanguage, targetLanguage);

  return [
    [...SAMPLE_TEMPLATE_HEADER],
    ...samples.map((row, index) => [
      row.term,
      row.translation,
      row.field,
      row.definition,
      row.note,
      row.partOfSpeech,
      String(index + 1),
    ]),
  ];
}

/** What the import dialog should say the file is expected to contain. */
export function describeExpectedPair(
  sourceLanguage: string | null | undefined,
  targetLanguage: string | null | undefined,
): string {
  const source = baseLanguage(sourceLanguage);
  const target = baseLanguage(targetLanguage);
  if (!source && !target) return "";

  const sourceName = getLanguageName(source || undefined);
  const targetName = getLanguageName(target || undefined);

  return source && source === target
    ? `This glossary is ${sourceName} → ${targetName}, so the second column is what each term means rather than a translation.`
    : `This glossary is ${sourceName} → ${targetName}. The second column should be ${targetName}.`;
}
