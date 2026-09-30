/**
 * The transcript on screen, turned into the model a Word or text file is written from.
 *
 * WHAT YOU DOWNLOAD IS WHAT YOU WERE READING — and "what you were reading" is decided by a dozen
 * rules that live in the web client and nowhere else: which language each line resolves to, where
 * a translation session starts, where the host paused the record, how utterances fold into speaker
 * turns, and when a language chip earns its place. A second copy of those rules in a document
 * builder would drift from the column the reader is looking at, one rule at a time, and the drift
 * would be invisible: the file still opens, it is simply not the transcript that was on screen.
 *
 * So the panel hands over exactly the inputs it renders from and this module applies the same
 * functions to them. It is pure — no React, no "@/" value imports — so the shape of the document
 * can be tested without a meeting, a browser or a docx library.
 *
 * ALWAYS THE READING SHAPE
 *   The reader may be in Chat or Timeline when they press Download. The document is the Reading
 *   ("document") layout regardless: the other two are postures for watching a meeting go by, and a
 *   file with one row per finalized STT chunk is not a document anybody reads.
 */

import { formatCitationTime } from "../meeting/meeting-summary.ts";
import { shouldShowLanguageChip, type LanguageMark } from "../transcript/document-reading.ts";
import {
  formatTranscriptPauseGapRun,
  groupIntoSpeakerTurns,
  splitSegmentsAroundPauseGaps,
  type TranscriptPauseGap,
} from "../transcript/transcript-display.ts";
import {
  resolveTranscriptLine,
  type SegmentTranslationIndex,
  type TranscriptLine,
} from "../transcript/transcript-language.ts";
import type {
  RecordDocumentMeta,
  TranscriptDocumentEntry,
  TranscriptDocumentLine,
  TranscriptDocumentModel,
} from "./record-documents.ts";

/**
 * What one row of the reading column is, structurally.
 *
 * A GROUPED utterance rather than a stored segment — the same rows the panel draws — because the
 * grouping, the Clean/Verbatim choice and the merge of consecutive chunks have all already
 * happened by the time the column exists. Anything that changes those changes the screen, and the
 * document follows the screen.
 */
export type TranscriptDocumentSegment = TranscriptLine & {
  speakerName?: string | null;
  speakerParticipantId?: string | null;
  startTimeMs: number;
  endTimeMs: number;
  receivedAt?: number | null;
};

/** One translation-session block, as `groupSegmentsByTranslationSession` produces it. */
export type TranscriptDocumentBlock<T> = {
  sessionNumber: number;
  segments: readonly T[];
};

export function buildTranscriptDocumentModel<T extends TranscriptDocumentSegment>({
  meta,
  blocks,
  gapsPerBlock,
  translationIndex,
  displayLanguage,
  meetingEnded,
  formatClock,
  sessionDividerLabel,
}: {
  meta: RecordDocumentMeta;
  blocks: readonly TranscriptDocumentBlock<T>[];
  /**
   * The pause windows drawn in each block, one entry per block and in the same order — see
   * `distributePauseGapsAcrossBlocks`. Handing the whole list to every block is the duplicate
   * divider bug WT-605 fixed, and it would reproduce here exactly as it did on screen.
   */
  gapsPerBlock?: readonly (readonly TranscriptPauseGap[])[];
  translationIndex: SegmentTranslationIndex;
  displayLanguage: string | null | undefined;
  /** The record of a finished meeting, which is what closes an unclosed pause window. */
  meetingEnded?: boolean;
  /**
   * The wall clock beside a turn, in the reader's own zone. Injected rather than computed here
   * because it depends on the transcript's base time and on the machine's locale, neither of
   * which belongs in a pure module — and both of which would make this untestable.
   */
  formatClock?: (startTimeMs: number) => string | null;
  /**
   * The words the on-screen session divider shows, including its clock range. Injected for the
   * same reason: the label is translated, and a catalog lookup is a React hook away.
   *
   * Omitted — or a meeting with one session, which is almost all of them — means no divider, the
   * same rule `showSessionLabels` applies on screen.
   */
  sessionDividerLabel?: (block: TranscriptDocumentBlock<T>) => string;
}): TranscriptDocumentModel {
  const entries: TranscriptDocumentEntry[] = [];
  const showSessionLabels = blocks.length > 1;

  /**
   * The line above, for the chip rule.
   *
   * It runs the length of the DOCUMENT rather than restarting per block, because the rule is about
   * a change and a change is only visible from the line before it — restarting would reprint "VI"
   * at the top of every session of a Vietnamese meeting, which is precisely the noise the rule
   * exists to remove. Dividers do not reset it either: they say the record stopped, not that the
   * language did.
   */
  let previousMark: LanguageMark | null = null;

  blocks.forEach((block, blockIndex) => {
    if (showSessionLabels && sessionDividerLabel) {
      entries.push({ kind: "divider", label: sessionDividerLabel(block) });
    }

    const runs = splitSegmentsAroundPauseGaps(block.segments, gapsPerBlock?.[blockIndex] ?? []);
    for (const run of runs) {
      if (run.gapsBefore.length) {
        entries.push({
          kind: "divider",
          label: formatTranscriptPauseGapRun(run.gapsBefore, { meetingEnded }),
        });
      }

      for (const turn of groupIntoSpeakerTurns(run.segments)) {
        const lines: TranscriptDocumentLine[] = turn.lines.map((line) => {
          const resolved = resolveTranscriptLine(line, translationIndex, displayLanguage);
          const mark: LanguageMark = {
            language: (resolved.spokenLanguage || "?").toLowerCase(),
            state: resolved.isPartial
              ? "partial"
              : resolved.isUntranslated
                ? "untranslated"
                : resolved.isTranslated
                  ? "translated"
                  : "spoken",
          };
          const showChip = shouldShowLanguageChip(mark, previousMark);
          previousMark = mark;
          return {
            text: resolved.text,
            // The chip's own wording, verbatim: the SPOKEN language, upper-cased, with "?" for a
            // line whose language was never recorded. See TranscriptLineLanguage.
            languageTag: showChip ? (resolved.spokenLanguage || "?").toUpperCase() : null,
          };
        });

        entries.push({
          kind: "turn",
          speakerName: turn.speakerName,
          elapsed: formatCitationTime(turn.startTimeMs),
          clock: formatClock?.(turn.startTimeMs) ?? null,
          lines,
        });
      }
    }
  });

  return { meta, entries };
}
