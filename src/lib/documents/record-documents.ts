/**
 * The meeting record as a document someone takes away: the transcript and the summary, as
 * Word files, built from what the Recap tab is showing.
 *
 * Built in the browser, from the same blocks the screen renders, rather than by the server.
 * "What you download is what you were reading" is only true if one piece of code decides both:
 * turn grouping, the pause split, which language each line resolves to and what the speaker is
 * called all live in the web client, and a second copy of them in C# would drift the way two
 * layouts of the minutes would. The minutes are the exception because they are a signed record
 * the server owns.
 *
 * This file is the contract. `transcript-docx.ts` and `summary-docx.ts` turn these models into
 * a .docx Blob; the panels build the models; `record-file-name.ts` names the file.
 */

/** What every record document carries in its header block. */
export interface RecordDocumentMeta {
  /** The room's title as the user typed it. Diacritics and all. */
  meetingTitle: string;
  /** When the meeting started, ISO 8601. Null for a meeting with no start on record. */
  startedAt: string | null;
  /** How long it ran, already formatted the way the transcript chip shows it ("42m"). */
  durationLabel?: string | null;
  hostName?: string | null;
  /** Everyone who spoke, in first-spoke order. */
  participants?: readonly string[];
  /** Human label of the language being read ("English", "As spoken"). */
  languageLabel?: string | null;
  workspaceName?: string | null;
}

/** One line inside a turn, already resolved to the language being read. */
export interface TranscriptDocumentLine {
  text: string;
  /** Upper-case code shown as a chip when this line is NOT in the language being read
   *  (the same rule as the Reading layout's language chip). Null when no chip is shown. */
  languageTag?: string | null;
}

/** One speaker turn, as the Reading ("document") layout draws it. */
export interface TranscriptDocumentTurn {
  kind: "turn";
  speakerName: string;
  /** Offset from the meeting start, as formatCitationTime writes it ("1:12"). */
  elapsed: string;
  /** Wall-clock time in the reader's zone, "HH:mm". Null when the start is unknown. */
  clock: string | null;
  lines: readonly TranscriptDocumentLine[];
}

/** A divider line the screen draws between runs: a new translation session, or a pause. */
export interface TranscriptDocumentDivider {
  kind: "divider";
  /** Exactly the words the on-screen divider shows, e.g. "Transcript paused · 09:40 – 09:44". */
  label: string;
}

export type TranscriptDocumentEntry = TranscriptDocumentTurn | TranscriptDocumentDivider;

export interface TranscriptDocumentModel {
  meta: RecordDocumentMeta;
  entries: readonly TranscriptDocumentEntry[];
}

export interface SummaryDocumentItem {
  text: string;
  owner?: string | null;
  /** Citation moments already formatted ("1:12"), primary first. Empty for legacy summaries. */
  citations: readonly string[];
}

export interface SummaryDocumentSection {
  key: string;
  title: string;
  items: readonly SummaryDocumentItem[];
}

export interface SummaryDocumentModel {
  meta: RecordDocumentMeta;
  /** Template label as the picker shows it ("Standup"). */
  templateLabel?: string | null;
  /** The overview paragraph(s) above the sections. */
  overview?: string | null;
  sections: readonly SummaryDocumentSection[];
  /** The sentence the rail shows instead of a summary, when there is none to show. */
  insufficientDataMessage?: string | null;
  /** True when the reader is looking at their own rendering (another template or language),
   *  not the summary the host published. The document says so under the title. */
  isPersonalRendering?: boolean;
}

/** The three things the Recap tab hands over, in the words the file name uses. */
export type RecordDocumentKind = "Transcript" | "Summary" | "Recording";
