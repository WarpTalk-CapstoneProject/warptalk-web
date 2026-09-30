/**
 * The words and order of a Recap document, without the Word part.
 *
 * `transcript-docx.ts` and `summary-docx.ts` decide how a document looks; this file decides what
 * it says: which header rows appear and in what order, how the date is written, what the footer
 * reads, what the plain-text copy of a transcript contains. Kept apart from the `docx` import so
 * those decisions can be tested under plain node, and so a caller that only wants the text (copy
 * to clipboard) never pulls the Word writer into its bundle.
 */

import type {
  RecordDocumentMeta,
  TranscriptDocumentModel,
} from "./record-documents.ts";

/** The document kinds that are built as Word files. Recordings are downloaded as they are. */
export type RecordDocumentTextKind = "Transcript" | "Summary";

export interface RecordHeaderRow {
  label: string;
  value: string;
}

/** Under the title when the reader downloads their own rendering rather than the published one.
 *  Said in the file itself because the file travels without the screen that explained it. */
export const PERSONAL_RENDERING_NOTE =
  "Your own version of this meeting. What the host published is unchanged.";

/** Used wherever a title is required and the room has none, the same fallback the file name uses. */
const FALLBACK_TITLE = "Meeting";

export function documentTitle(meta: RecordDocumentMeta): string {
  return meta.meetingTitle.trim() || FALLBACK_TITLE;
}

/** The Word core "Title" property: what Explorer and Word's title bar show for the file. */
export function documentCoreTitle(meta: RecordDocumentMeta, kind: RecordDocumentTextKind): string {
  return `${documentTitle(meta)} - ${kind}`;
}

/** The small upper-case label above the title. Upper-cased here, not by a Word caps flag, so the
 *  plain text and any copy-paste out of Word read the same. */
export function kindLabel(kind: RecordDocumentTextKind): string {
  return kind.toUpperCase();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * "2026-09-18 09:30 (UTC+07:00)".
 *
 * The offset is written out because a document outlives the screen: the app shows times in the
 * reader's zone and says nothing, since everyone on screen shares it. A file forwarded to someone
 * in another country does not, and "09:30" alone would be read in theirs.
 *
 * `offsetMinutes` (east of UTC positive) is for tests; callers leave it out and get the reader's
 * own zone at that instant, DST included.
 */
export function formatMeetingDate(
  iso: string | null | undefined,
  offsetMinutes?: number,
): string | null {
  if (!iso) return null;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  const offset = offsetMinutes ?? -instant.getTimezoneOffset();
  // Shift the instant by the offset and read it back as UTC: the wall clock in that zone,
  // without depending on the zone the code happens to run in.
  const wall = new Date(instant.getTime() + offset * 60_000);
  const date = `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`;
  const time = `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`;
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return `${date} ${time} (UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)})`;
}

function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The label/value rows under the title, in reading order. A row with nothing to say is left out
 * rather than printed as "Host: —": the header is what the reader skims, and an empty row there
 * looks like missing data rather than data that never existed.
 *
 * `templateLabel` is the summary's own row; the transcript has no template.
 */
export function recordHeaderRows(
  meta: RecordDocumentMeta,
  options: { templateLabel?: string | null; offsetMinutes?: number } = {},
): RecordHeaderRow[] {
  const participants = (meta.participants ?? [])
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const candidates: Array<[string, string | null]> = [
    ["Date", formatMeetingDate(meta.startedAt, options.offsetMinutes)],
    ["Duration", present(meta.durationLabel)],
    ["Host", present(meta.hostName)],
    ["Participants", participants.length > 0 ? participants.join(", ") : null],
    ["Language", present(meta.languageLabel)],
    ["Template", present(options.templateLabel)],
    ["Workspace", present(meta.workspaceName)],
  ];
  return candidates
    .filter((row): row is [string, string] => row[1] !== null)
    .map(([label, value]) => ({ label, value }));
}

/**
 * The footer as the text around the two page fields: `${before}<PAGE>${between}<NUMPAGES>`.
 * Same shape as the global minutes footer, minus any product name — the document belongs to the
 * workspace that held the meeting, not to the tool that wrote it down.
 */
export function footerTextParts(
  meta: RecordDocumentMeta,
  kind: RecordDocumentTextKind,
): { before: string; between: string } {
  return { before: `${documentTitle(meta)} · ${kind} — Page `, between: " of " };
}

/** " [JA]" after a line that is not in the language being read, as the Reading layout's chip. */
export function languageTagSuffix(tag: string | null | undefined): string {
  const code = present(tag);
  return code ? ` [${code.toUpperCase()}]` : "";
}

/** "1:12 · 09:31", or just "1:12" when the wall clock is unknown. */
export function turnTimeLabel(elapsed: string, clock: string | null): string {
  return clock ? `${elapsed} · ${clock}` : elapsed;
}

/**
 * The transcript as plain text, for pasting into a chat or an email.
 *
 * One block per turn with a blank line between, so a paste keeps the turns apart in any client
 * that collapses single newlines; the time leads each block so the text is still searchable by
 * moment once the formatting is gone.
 */
export function transcriptPlainText(model: TranscriptDocumentModel): string {
  const lines: string[] = [`${documentTitle(model.meta)} — Transcript`];
  const subtitle = [formatMeetingDate(model.meta.startedAt), present(model.meta.durationLabel)]
    .filter((part): part is string => part !== null)
    .join(" · ");
  if (subtitle) lines.push(subtitle);

  for (const entry of model.entries) {
    lines.push("");
    if (entry.kind === "divider") {
      lines.push(`— ${entry.label} —`);
      continue;
    }
    lines.push(`[${turnTimeLabel(entry.elapsed, entry.clock)}] ${entry.speakerName}`);
    for (const line of entry.lines) {
      lines.push(`${line.text}${languageTagSuffix(line.languageTag)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
