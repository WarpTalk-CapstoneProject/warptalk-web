/**
 * Reading a multilingual meeting back, in ONE language.
 *
 * A saved transcript is stored the way it was captured: one row per finalized STT chunk, each
 * in whatever language the person who said it was speaking. That is the right thing to store
 * and the wrong thing to read. In a Vietnamese/Japanese meeting the record came back as an
 * interleaving of two languages — a reader who understands one of them can follow half of what
 * was said, which is the half the meeting already worked without translation.
 *
 * The translations were there the whole time. `segment_translation_links` holds the current
 * translation of every segment into every language the room actually produced, and
 * `GET /transcripts/{id}/translations` has always served them; nothing on the room page asked.
 *
 * This module is the part of "show the transcript in one language" that has no React in it:
 * which languages a meeting can be read in, which one to open on, and what a single line reads
 * as once a language is chosen. Pure so the answers can be tested without a meeting.
 */

// Relative, with the extension: this module's unit tests run under the plain node test runner
// (`--experimental-strip-types`), which does not resolve the "@/" alias. Both of these are real
// values, not types, so they survive to runtime and have to resolve there.
import { normalizeLanguageCode } from "../language/languages.ts";
import { appendText } from "./transcript-display.ts";

import type { TranscriptTranslationDto } from "@/types/transcript";

/**
 * The choice that leaves every line as it was spoken — the transcript's stored form.
 *
 * Deliberately not a language code, and deliberately not "". It travels through the same
 * dropdown state as a real language, and an empty string would be indistinguishable from "the
 * reader has not chosen yet". Never pass it to normalizeLanguageCode: that folds "as-spoken"
 * to "as", which is Assamese.
 */
export const AS_SPOKEN = "as-spoken";

/**
 * The shape this module needs from a transcript line. Structural rather than the DTO, because
 * a line here is a GROUPED utterance — several stored segments merged into one bubble — and
 * that is a shape only the display layer has.
 */
export type TranscriptLine = {
  id: string;
  originalText: string;
  originalLanguage?: string | null;
  /**
   * Every segment id folded into this line by grouping, the first one included. Absent means
   * the line is a single segment.
   *
   * This is why grouping had to start carrying the list: translations are keyed by the segment
   * ids the backend emitted, and a merged bubble keeps only the FIRST of them in `id`. Reading
   * translations off `id` alone silently dropped the second and third sentence of every
   * utterance somebody said without pausing.
   */
  mergedSegmentIds?: readonly string[];
};

/** segment id → language code → translated text. */
export type SegmentTranslationIndex = Record<string, Record<string, string>>;

export type TranscriptLanguageOption = {
  /** Bare ISO-639-1, already normalized. */
  code: string;
  /** Lines that were SPOKEN in this language. */
  spokenCount: number;
  /** Lines translated into it. */
  translatedCount: number;
  /** Lines a reader could read in it at all — spoken plus translated. */
  readableCount: number;
  /**
   * Lines that are FULLY in it. Lower than `readableCount` when a merged utterance has a
   * translation for some of the segments it absorbed and not the rest — readable, and still not
   * the whole line. The picker counts with this one, so it cannot promise "the whole meeting"
   * over a transcript that then marks a line as incomplete.
   */
  completeCount: number;
  /** Lines in the transcript, so a caller can render "128 of 145" without recounting. */
  totalCount: number;
};

export type ResolvedTranscriptLine = {
  /** What to render. */
  text: string;
  /** The language `text` is in — not necessarily the one that was asked for. */
  language: string;
  /** `text` is a translation of what was said, not what was said. */
  isTranslated: boolean;
  /** The reader asked for a language this line was never translated into, so it stayed put. */
  isUntranslated: boolean;
  /**
   * Part of this line was translated and part of it was not.
   *
   * Only a merged utterance can be in this state — several stored segments rendered as one
   * bubble, where the translation of one of them is missing. Without this the missing sentence
   * simply disappears: the bubble reads as a complete, fluent rendering of the whole utterance
   * and is quietly short a sentence, which is worse than an obviously untranslated line.
   */
  isPartial: boolean;
  /** The words actually spoken, always — the reveal under a translated line reads this. */
  spokenText: string;
  spokenLanguage: string;
};

/**
 * Folds the flat translation page into a per-segment lookup.
 *
 * The endpoint returns one row per (segment, language) current link, in segment order. At most
 * one row per pair can be current (segment_translation_links_current_unique_idx), so a later
 * row for the same pair is a superseded one arriving late rather than a second translation,
 * and last-wins is the right resolution.
 */
export function indexTranslationsBySegment(
  translations: readonly Pick<
    TranscriptTranslationDto,
    "segmentId" | "targetLanguage" | "translatedText"
  >[],
): SegmentTranslationIndex {
  const index: SegmentTranslationIndex = {};

  for (const translation of translations) {
    const code = normalizeLanguageCode(translation.targetLanguage ?? "");
    const text = translation.translatedText?.trim();
    if (!code || !text) continue;

    const forSegment = index[translation.segmentId] ?? (index[translation.segmentId] = {});
    forSegment[code] = text;
  }

  return index;
}

function lineSegmentIds(line: TranscriptLine): readonly string[] {
  return line.mergedSegmentIds?.length ? line.mergedSegmentIds : [line.id];
}

/**
 * Every translation available for a line, with a merged utterance's parts joined back into one
 * sentence per language — the same join the original text went through when the bubble was
 * merged, so the two halves of a bubble stay two halves of a sentence.
 */
export function translationsForLine(
  line: TranscriptLine,
  index: SegmentTranslationIndex,
): Record<string, string> {
  const merged: Record<string, string> = {};

  for (const segmentId of lineSegmentIds(line)) {
    const forSegment = index[segmentId];
    if (!forSegment) continue;

    for (const [code, text] of Object.entries(forSegment)) {
      merged[code] = appendText(merged[code], text);
    }
  }

  return merged;
}

/**
 * The languages this meeting can actually be read in, best coverage first.
 *
 * Built from the record rather than from the room's declared languages on purpose. A room can
 * declare a language nobody ever spoke or translated into, and offering it would hand the
 * reader a transcript where every single line came back untranslated — a dropdown entry whose
 * only effect is to make the page look broken. What is offered is what there is text for.
 */
export function transcriptLanguageOptions(
  lines: readonly TranscriptLine[],
  index: SegmentTranslationIndex,
): TranscriptLanguageOption[] {
  const spoken = new Map<string, number>();
  const translated = new Map<string, number>();
  const readable = new Map<string, number>();
  const complete = new Map<string, number>();

  const bump = (counter: Map<string, number>, code: string) =>
    counter.set(code, (counter.get(code) ?? 0) + 1);

  for (const line of lines) {
    const spokenCode = normalizeLanguageCode(line.originalLanguage ?? "");
    const codes = new Set<string>();
    const segmentIds = lineSegmentIds(line);

    if (spokenCode) {
      bump(spoken, spokenCode);
      codes.add(spokenCode);
      // A line was said in this language; there is no part of it that could be missing.
      bump(complete, spokenCode);
    }

    for (const code of Object.keys(translationsForLine(line, index))) {
      // A translation into the language the line was already spoken in is not a translation;
      // resolveTranscriptLine prefers the spoken words in that case, so counting it would
      // claim coverage this module would never use.
      if (code === spokenCode) continue;
      bump(translated, code);
      codes.add(code);

      // Counted per segment, exactly as resolveTranscriptLine decides isPartial: a merged
      // utterance whose second half was never translated is readable and is not complete.
      const covered = segmentIds.reduce(
        (count, segmentId) => (index[segmentId]?.[code]?.trim() ? count + 1 : count),
        0,
      );
      if (covered === segmentIds.length) bump(complete, code);
    }

    for (const code of codes) bump(readable, code);
  }

  return [...readable.keys()]
    .map((code) => ({
      code,
      spokenCount: spoken.get(code) ?? 0,
      translatedCount: translated.get(code) ?? 0,
      readableCount: readable.get(code) ?? 0,
      completeCount: complete.get(code) ?? 0,
      totalCount: lines.length,
    }))
    .sort(
      (left, right) =>
        right.readableCount - left.readableCount
        || right.spokenCount - left.spokenCount
        || left.code.localeCompare(right.code),
    );
}

/**
 * The picker's list: what the transcript already has, plus what it could be given.
 *
 * `transcriptLanguageOptions` is built from the record, and its reason for refusing to offer a
 * language with no text in it was sound — a dropdown entry whose only effect is to return every
 * line untranslated reads as a broken page. That reason no longer holds. Choosing a language now
 * translates the lines missing from it, so an entry with a coverage of zero is an offer rather
 * than a dead end, and withholding it is what leaves a reader stuck: a meeting where translation
 * was never started had NO entries at all, which is the case the picker was most needed for.
 *
 * Kept separate from `transcriptLanguageOptions` rather than folded into it because
 * `defaultTranscriptLanguage` reads that list to decide what to open on, and it must keep
 * deciding from what the meeting actually produced. A catalogue of offers is not evidence that
 * a meeting was multilingual.
 */
export function withOfferableLanguages(
  options: readonly TranscriptLanguageOption[],
  offerable: readonly string[],
  totalCount: number,
): TranscriptLanguageOption[] {
  const known = new Set(options.map((option) => option.code));
  const extra = offerable
    .map((code) => normalizeLanguageCode(code))
    .filter((code) => code && !known.has(code))
    .map((code) => ({
      code,
      spokenCount: 0,
      translatedCount: 0,
      readableCount: 0,
      completeCount: 0,
      totalCount,
    }));

  // Already-covered languages first, in their existing order; the offers follow, alphabetically,
  // so the list does not reorder itself as a backfill lands.
  return [...options, ...extra.sort((left, right) => left.code.localeCompare(right.code))];
}

/**
 * Which language to open the transcript on.
 *
 * The reader's own language wins when the meeting has it, because the whole point is that
 * somebody who was in the room can read what was said. Otherwise the language the most lines
 * are readable in — the meeting's own common denominator.
 *
 * A meeting held in ONE language falls back to as-spoken. Unifying a transcript that is already
 * unified changes nothing, and starting on a language chip implies a choice was made about a
 * question that was never asked.
 */
export function defaultTranscriptLanguage(
  options: readonly TranscriptLanguageOption[],
  preferredLanguage?: string | null,
): string {
  if (options.length <= 1) return AS_SPOKEN;

  const preferred = normalizeLanguageCode(preferredLanguage ?? "");
  if (preferred && options.some((option) => option.code === preferred)) return preferred;

  return options[0]?.code ?? AS_SPOKEN;
}

/** The language a display choice actually asks for — "" when it asks for none. */
function requestedLanguage(displayLanguage: string | null | undefined): string {
  if (!displayLanguage || displayLanguage === AS_SPOKEN) return "";
  return normalizeLanguageCode(displayLanguage);
}

/**
 * What one line reads as, once a language is chosen.
 *
 * Three outcomes, and the caller can tell them apart: the line was already in that language
 * (nothing to say), it was translated into it (say so, and offer the original), or it was never
 * translated into it (say THAT, rather than quietly showing a language the reader did not ask
 * for as though it were the one they did).
 */
export function resolveTranscriptLine(
  line: TranscriptLine,
  index: SegmentTranslationIndex,
  displayLanguage: string | null | undefined,
): ResolvedTranscriptLine {
  const spokenLanguage = normalizeLanguageCode(line.originalLanguage ?? "");
  const spokenText = line.originalText ?? "";
  const asSpoken: ResolvedTranscriptLine = {
    text: spokenText,
    language: spokenLanguage,
    isTranslated: false,
    isUntranslated: false,
    isPartial: false,
    spokenText,
    spokenLanguage,
  };

  const wanted = requestedLanguage(displayLanguage);
  if (!wanted || wanted === spokenLanguage) return asSpoken;

  // Walked per segment rather than through the merged map, because how MANY of them carried a
  // translation is the answer, not just whether any did.
  const segmentIds = lineSegmentIds(line);
  let translated = "";
  let covered = 0;
  for (const segmentId of segmentIds) {
    const part = index[segmentId]?.[wanted]?.trim();
    if (!part) continue;
    covered += 1;
    translated = appendText(translated, part);
  }

  if (!translated) return { ...asSpoken, isUntranslated: true };

  return {
    text: translated,
    language: wanted,
    isTranslated: true,
    isUntranslated: false,
    isPartial: covered < segmentIds.length,
    spokenText,
    spokenLanguage,
  };
}

/**
 * The transcript as plain text — what Copy puts on the clipboard and Download writes to a file.
 *
 * Follows the language on screen, because a reader who unified the transcript and then copied
 * it wants the thing they were reading. A language tag is printed exactly when the line is NOT
 * in the chosen language: on every line in as-spoken mode, and only on the lines that were
 * never translated otherwise. A tag on every line of a unified transcript would be noise; no
 * tag on a line that slipped through untranslated would be a lie.
 *
 * A partly translated line carries what was said after it, in brackets. On screen the reveal is
 * one click away; a text file has no clicks, and dropping the sentence that was never translated
 * would leave a file that reads as complete and is not.
 */
export function assembleTranscriptText<
  T extends TranscriptLine & { speakerName?: string | null },
>(
  blocks: readonly { sessionNumber: number; segments: readonly T[] }[],
  index: SegmentTranslationIndex,
  displayLanguage: string | null | undefined,
): string {
  const wanted = requestedLanguage(displayLanguage);
  const showSessionLabels = blocks.length > 1;

  return blocks
    .map((block) => {
      const lines = block.segments.map((segment) => {
        const resolved = resolveTranscriptLine(segment, index, displayLanguage);
        const name = segment.speakerName?.trim() || "Unknown speaker";
        const tag =
          resolved.language && resolved.language !== wanted
            ? ` (${resolved.language.toUpperCase()})`
            : "";
        const spoken = resolved.isPartial
          ? ` [${(resolved.spokenLanguage || "?").toUpperCase()}: ${resolved.spokenText}]`
          : "";
        return `${name}${tag}: ${resolved.text}${spoken}`;
      });

      if (!showSessionLabels) return lines.join("\n");
      return [`--- Translation ${block.sessionNumber} ---`, ...lines].join("\n");
    })
    .join("\n\n");
}
