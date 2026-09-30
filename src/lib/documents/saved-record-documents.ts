/**
 * A saved transcript or summary BODY, turned into the model its Word file is written from.
 *
 * The Recap panels build their documents from what they render: live segments, translations, the
 * summary rendering the reader picked. Two places have none of that, only the text the server
 * stored when the meeting ended:
 *   - the Artifacts reader, when a transcript has no saved segments to render from;
 *   - the past-meeting dialog on the calendar, which lists a meeting's files without opening it.
 *
 * Both used to hand that stored text straight over as `.txt` / `.md`, so the same transcript
 * downloaded as a Word document from one page and as a markdown dump from the next. This module
 * turns the stored text into the same `TranscriptDocumentModel` / `SummaryDocumentModel` the Recap
 * uses, so every download of a transcript or summary is the one .docx layout.
 *
 * Pure, with no "@/" value imports, so the parsing can be tested under plain node.
 */

import { isTranscriptControlMarker } from "../transcript/transcript-display.ts";
import {
  buildSummaryDocumentModel,
  type SummaryModelContent,
} from "./summary-document-model.ts";
import type {
  RecordDocumentMeta,
  SummaryDocumentModel,
  TranscriptDocumentEntry,
  TranscriptDocumentModel,
} from "./record-documents.ts";

/** One speaker turn as the stored markdown writes it. */
export interface SavedTranscriptTurn {
  speakerName: string;
  /** The language in the speaker marker — `**[Nhi (VI)]**:` — when the export wrote one. */
  language?: string;
  /** `[1:12]` in front of the line, when the export wrote one. */
  elapsedTime?: string;
  paragraphs: string[];
}

const SPEAKER_LINE_REGEX = /^\*\*\[(.+?)(?:\s+\(([^()]*)\))?\]\*\*:\s*(.*)$/;
// i18n-allow: Regex character class matching Unicode Vietnamese characters in transcript speaker names
const PLAIN_SPEAKER_REGEX = /^([A-ZÀ-Ỹa-zà-ỹ0-9_.\s]+?):\s*(.*)$/;
const TIMESTAMP_PREFIX_REGEX = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/;

/**
 * The stored transcript export, as speaker turns.
 *
 * The export is markdown with a `# WarpTalk Transcription Room` header, a "Generated on" line and
 * one `**[Name (LANG)]**: text` line per utterance. The header and the pipeline's control markers
 * are not part of what was said and are dropped; consecutive lines from one speaker are one turn,
 * the same folding the Reading layout does.
 */
export function parseSavedTranscriptBody(body: string | null | undefined): SavedTranscriptTurn[] {
  if (!body?.trim()) return [];

  const rawLines = body.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim());
  const turns: SavedTranscriptTurn[] = [];

  for (const raw of rawLines) {
    if (!raw) continue;
    if (
      /^#\s+WarpTalk Transcription Room\b/i.test(raw) ||
      /^Generated on:/i.test(raw) ||
      /^(-{3,}|\*{3,}|_{3,})$/.test(raw) ||
      isTranscriptControlMarker(raw)
    ) {
      continue;
    }

    let line = raw;
    let explicitTime: string | undefined;

    const timeMatch = TIMESTAMP_PREFIX_REGEX.exec(line);
    if (timeMatch) {
      explicitTime = timeMatch[1];
      line = timeMatch[2];
    }

    let speakerName = "Speaker";
    let language: string | undefined;
    let content = line;

    const boldMatch = SPEAKER_LINE_REGEX.exec(line);
    if (boldMatch) {
      speakerName = boldMatch[1].trim();
      language = boldMatch[2]?.trim() || undefined;
      content = boldMatch[3].trim();
    } else {
      const plainMatch = PLAIN_SPEAKER_REGEX.exec(line);
      if (plainMatch && !plainMatch[1].toLowerCase().startsWith("http")) {
        speakerName = plainMatch[1].trim();
        content = plainMatch[2].trim();
      }
    }

    if (speakerName.toLowerCase() === "system" || isTranscriptControlMarker(content)) {
      continue;
    }

    const previous = turns[turns.length - 1];
    if (previous && previous.speakerName === speakerName) {
      if (content) previous.paragraphs.push(content);
    } else {
      turns.push({
        speakerName,
        language,
        elapsedTime: explicitTime,
        paragraphs: content ? [content] : [],
      });
    }
  }

  return turns;
}

/**
 * The stored transcript as the Word model.
 *
 * The export carries no timings, so a turn's time is the `[m:ss]` the export wrote when it wrote
 * one and empty otherwise. The language tag follows the Reading layout's rule: it is printed where
 * the language CHANGES, not on every line of a meeting held in one language.
 */
export function savedTranscriptDocumentModel(
  meta: RecordDocumentMeta,
  body: string | null | undefined,
): TranscriptDocumentModel {
  const entries: TranscriptDocumentEntry[] = [];
  let previousLanguage: string | null = null;

  for (const turn of parseSavedTranscriptBody(body)) {
    if (turn.paragraphs.length === 0) continue;
    const language = turn.language?.toUpperCase() ?? null;
    const showTag = language !== null && previousLanguage !== null && language !== previousLanguage;
    if (language !== null) previousLanguage = language;

    entries.push({
      kind: "turn",
      speakerName: turn.speakerName,
      elapsed: turn.elapsedTime ?? "",
      clock: null,
      lines: turn.paragraphs.map((text, index) => ({
        text,
        languageTag: showTag && index === 0 ? language : null,
      })),
    });
  }

  return { meta, entries };
}

/**
 * Markdown punctuation out of a summary that was stored as markdown rather than as JSON.
 *
 * A legacy summary export is a markdown page; printed as-is into Word it would show `##` and `**`
 * as literal characters. Only the marks are removed — the words, and the paragraph breaks the
 * document writer splits on, stay exactly as stored.
 */
export function plainSummaryText(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s*[-*+]\s+/, "• ")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1"),
    )
    .join("\n")
    .trim();
}

/**
 * The stored summary as the Word model.
 *
 * `content` is the parsed summary payload (`readSummaryArtifact`) when the export is JSON, which
 * is every summary written since structured summaries shipped; it goes through the same
 * `buildSummaryDocumentModel` the Recap rail uses. A legacy markdown export has no sections to
 * speak of, so its text becomes the overview.
 */
export function savedSummaryDocumentModel(
  meta: RecordDocumentMeta,
  content: SummaryModelContent | null | undefined,
  rawBody: string | null | undefined,
  options: { templateLabel?: string | null; insufficientDataMessage?: string | null } = {},
): SummaryDocumentModel {
  const summary: SummaryModelContent | null = content
    ? content
    : rawBody?.trim()
      ? { summary: plainSummaryText(rawBody), sections: [] }
      : null;

  return buildSummaryDocumentModel({
    meta,
    summary,
    templateLabel: options.templateLabel ?? null,
    insufficientDataMessage: options.insufficientDataMessage ?? null,
  });
}
