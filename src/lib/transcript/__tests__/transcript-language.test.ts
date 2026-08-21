import assert from "node:assert/strict";
import test from "node:test";

import {
  AS_SPOKEN,
  assembleTranscriptText,
  defaultTranscriptLanguage,
  indexTranslationsBySegment,
  resolveTranscriptLine,
  transcriptLanguageOptions,
  translationsForLine,
  type SegmentTranslationIndex,
} from "../transcript-language.ts";
import { normalizeLanguageCode } from "../../language/languages.ts";

function line(
  id: string,
  originalText: string,
  originalLanguage: string,
  mergedSegmentIds?: string[],
) {
  return { id, originalText, originalLanguage, mergedSegmentIds, speakerName: "Tuan" };
}

function translation(segmentId: string, targetLanguage: string, translatedText: string) {
  return { segmentId, targetLanguage, translatedText };
}

test("translations are indexed per segment, on the normalized language code", () => {
  const index = indexTranslationsBySegment([
    translation("s1", "vi-VN", "Xin chao"),
    translation("s1", "en", "Hello"),
    translation("s2", "VI", "Vang"),
  ]);

  assert.deepEqual(index, {
    s1: { vi: "Xin chao", en: "Hello" },
    s2: { vi: "Vang" },
  });
});

test("a translation with no text is not a translation", () => {
  // An empty row would otherwise register as coverage and hand the reader a blank line where
  // the words they asked for should be.
  const index = indexTranslationsBySegment([
    translation("s1", "vi", "   "),
    translation("s2", "", "Hello"),
  ]);

  assert.deepEqual(index, {});
});

test("a merged utterance reassembles every part of its translation", () => {
  // The defect this exists to prevent: grouping keeps only the FIRST segment id, so reading
  // translations off it showed the opening third of every long sentence and dropped the rest.
  const index = indexTranslationsBySegment([
    translation("s1", "en", "I think"),
    translation("s2", "en", "we should ship it"),
  ]);

  assert.deepEqual(
    translationsForLine(line("s1", "Toi nghi chung ta nen ship", "vi", ["s1", "s2"]), index),
    { en: "I think we should ship it" },
  );
});

test("the languages offered are the ones the record can actually be read in", () => {
  const index = indexTranslationsBySegment([
    translation("s1", "vi", "Xin chao"),
    translation("s2", "vi", "Vang"),
    translation("s2", "en", "Yes"),
  ]);
  const options = transcriptLanguageOptions(
    [line("s1", "Hello", "en"), line("s2", "Konnichiwa", "ja")],
    index,
  );

  // Vietnamese reads both lines and was spoken in neither — a language that exists only as a
  // translation is still a language this meeting can be read in. English reads both too, and
  // comes first on the tie: half of it is what people actually said rather than a machine's
  // rendering of it.
  assert.deepEqual(options.map((option) => option.code), ["en", "vi", "ja"]);
  assert.deepEqual(options[0], {
    code: "en",
    spokenCount: 1,
    translatedCount: 1,
    readableCount: 2,
    totalCount: 2,
  });
  assert.deepEqual(options[1], {
    code: "vi",
    spokenCount: 0,
    translatedCount: 2,
    readableCount: 2,
    totalCount: 2,
  });
});

test("a language nothing was said or translated into is not offered", () => {
  const options = transcriptLanguageOptions([line("s1", "Hello", "en")], {});

  assert.deepEqual(options.map((option) => option.code), ["en"]);
});

test("a translation into the language the line was already spoken in is not coverage", () => {
  const index = indexTranslationsBySegment([translation("s1", "en", "Hello there")]);
  const [option] = transcriptLanguageOptions([line("s1", "Hello there", "en")], index);

  assert.equal(option.translatedCount, 0);
  assert.equal(option.readableCount, 1);
});

test("a meeting held in one language opens as spoken", () => {
  // Unifying an already-unified transcript changes nothing, and a language chip implies a
  // choice was made about a question nobody asked.
  const options = transcriptLanguageOptions([line("s1", "Hello", "en")], {});

  assert.equal(defaultTranscriptLanguage(options, "vi"), AS_SPOKEN);
});

test("the reader's own language wins when the meeting has it", () => {
  const index = indexTranslationsBySegment([
    translation("s1", "vi", "Xin chao"),
    translation("s1", "ja", "Konnichiwa"),
  ]);
  const options = transcriptLanguageOptions([line("s1", "Hello", "en"), line("s2", "Hi", "en")], index);

  assert.equal(defaultTranscriptLanguage(options, "vi-VN"), "vi");
});

test("without a language of their own the reader gets the widest coverage", () => {
  const index = indexTranslationsBySegment([
    translation("s1", "vi", "Xin chao"),
    translation("s2", "vi", "Vang"),
    translation("s1", "ja", "Konnichiwa"),
  ]);
  const options = transcriptLanguageOptions([line("s1", "Hello", "en"), line("s2", "Yes", "en")], index);

  assert.equal(defaultTranscriptLanguage(options, "ko"), "en");
  assert.equal(options[0].code, "en");
});

test("as-spoken leaves every line in the language it was said in", () => {
  const index = indexTranslationsBySegment([translation("s1", "vi", "Xin chao")]);
  const resolved = resolveTranscriptLine(line("s1", "Hello", "en"), index, AS_SPOKEN);

  assert.equal(resolved.text, "Hello");
  assert.equal(resolved.language, "en");
  assert.equal(resolved.isTranslated, false);
  assert.equal(resolved.isUntranslated, false);
});

test("as-spoken is never mistaken for a language", () => {
  // normalizeLanguageCode("as-spoken") folds to "as", which is Assamese. Every path that
  // could ask for a language has to check the sentinel BEFORE normalizing, or a transcript
  // silently starts asking for a language nobody in the meeting has ever heard of.
  assert.equal(normalizeLanguageCode(AS_SPOKEN), "as");
  assert.equal(
    resolveTranscriptLine(line("s1", "Hello", "en"), {}, AS_SPOKEN).isUntranslated,
    false,
  );
});

test("a line already in the chosen language shows what was said, not a round trip", () => {
  const index = indexTranslationsBySegment([translation("s1", "en", "Hello (translated)")]);
  const resolved = resolveTranscriptLine(line("s1", "Hello", "en"), index, "en");

  assert.equal(resolved.text, "Hello");
  assert.equal(resolved.isTranslated, false);
});

test("a translated line carries the original with it", () => {
  const index = indexTranslationsBySegment([translation("s1", "vi", "Xin chao moi nguoi")]);
  const resolved = resolveTranscriptLine(line("s1", "Hello everyone", "en"), index, "vi-VN");

  assert.equal(resolved.text, "Xin chao moi nguoi");
  assert.equal(resolved.language, "vi");
  assert.equal(resolved.isTranslated, true);
  assert.equal(resolved.spokenText, "Hello everyone");
  assert.equal(resolved.spokenLanguage, "en");
});

test("a merged line missing one part's translation is marked, not quietly shortened", () => {
  // The bubble would otherwise read as a complete, fluent rendering of the whole utterance and
  // be a sentence short — worse than an obviously untranslated line, because nothing on screen
  // says anything is missing.
  const index = indexTranslationsBySegment([translation("s1", "vi", "Rat vui duoc gap ban")]);
  const resolved = resolveTranscriptLine(
    line("s1", "Hajimemashite. AI de benkyou dekimasu.", "ja", ["s1", "s2"]),
    index,
    "vi",
  );

  assert.equal(resolved.text, "Rat vui duoc gap ban");
  assert.equal(resolved.isTranslated, true);
  assert.equal(resolved.isPartial, true);
  assert.equal(resolved.spokenText, "Hajimemashite. AI de benkyou dekimasu.");
});

test("a fully translated merged line is not partial", () => {
  const index = indexTranslationsBySegment([
    translation("s1", "vi", "Rat vui duoc gap ban"),
    translation("s2", "vi", "Toi co the hoc bang AI"),
  ]);
  const resolved = resolveTranscriptLine(
    line("s1", "Hajimemashite. AI de benkyou dekimasu.", "ja", ["s1", "s2"]),
    index,
    "vi",
  );

  assert.equal(resolved.text, "Rat vui duoc gap ban Toi co the hoc bang AI");
  assert.equal(resolved.isPartial, false);
});

test("a partly translated line takes what was said with it into a text file", () => {
  // On screen the original is one click away. A text file has no clicks, and a file that reads
  // as complete while missing a sentence is the one thing worse than a cluttered one.
  const index = indexTranslationsBySegment([translation("s1", "vi", "Rat vui duoc gap ban")]);
  const text = assembleTranscriptText(
    [
      {
        sessionNumber: 1,
        segments: [line("s1", "Hajimemashite. AI de benkyou dekimasu.", "ja", ["s1", "s2"])],
      },
    ],
    index,
    "vi",
  );

  assert.equal(
    text,
    "Tuan: Rat vui duoc gap ban [JA: Hajimemashite. AI de benkyou dekimasu.]",
  );
});

test("a line the meeting never translated says so rather than pretending", () => {
  const resolved = resolveTranscriptLine(line("s1", "Konnichiwa", "ja"), {}, "vi");

  assert.equal(resolved.text, "Konnichiwa");
  assert.equal(resolved.language, "ja");
  assert.equal(resolved.isUntranslated, true);
  assert.equal(resolved.isTranslated, false);
});

const exportIndex: SegmentTranslationIndex = indexTranslationsBySegment([
  translation("s1", "vi", "Xin chao"),
]);

test("exported text follows the language on screen and tags only what escaped it", () => {
  const text = assembleTranscriptText(
    [
      {
        sessionNumber: 1,
        segments: [line("s1", "Hello", "en"), line("s2", "Konnichiwa", "ja")],
      },
    ],
    exportIndex,
    "vi",
  );

  assert.equal(text, "Tuan: Xin chao\nTuan (JA): Konnichiwa");
});

test("as-spoken export tags every line, because none of them was chosen", () => {
  const text = assembleTranscriptText(
    [{ sessionNumber: 1, segments: [line("s1", "Hello", "en")] }],
    exportIndex,
    AS_SPOKEN,
  );

  assert.equal(text, "Tuan (EN): Hello");
});

test("more than one translation session keeps its dividers", () => {
  const text = assembleTranscriptText(
    [
      { sessionNumber: 1, segments: [line("s1", "Hello", "en")] },
      { sessionNumber: 2, segments: [line("s2", "Konnichiwa", "ja")] },
    ],
    exportIndex,
    "vi",
  );

  assert.equal(
    text,
    "--- Translation 1 ---\nTuan: Xin chao\n\n--- Translation 2 ---\nTuan (JA): Konnichiwa",
  );
});
