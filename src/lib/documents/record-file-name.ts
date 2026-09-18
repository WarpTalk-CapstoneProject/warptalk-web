/**
 * The name a Recap download arrives under: "Họp sprint 42 - Transcript (JA) - 2026-09-18.docx".
 *
 * THE MEETING LEADS
 *     The minutes are named "BB-2026-0001 - Họp sprint 42.docx" (MinutesFileName on the server):
 *     the number first because it is the record's identity. A transcript has no number, so the
 *     meeting's own name is its identity and goes first, followed by what the file is.
 *
 * THE DATE TRAILS
 *     A weekly meeting keeps its title, so without a date seven standups download as
 *     "Daily standup - Transcript (1).docx" … "(6).docx". ISO order so a folder sorts by it.
 *
 * WHAT IS STRIPPED
 *     Only what an operating system refuses, the same set MinutesFileName strips, and the
 *     trailing dots and spaces Windows silently drops. Diacritics stay: they are the name.
 */

import type { RecordDocumentKind } from "./record-documents.ts";

/** Same limit as MinutesFileName.MaxTitleLength. */
const MAX_TITLE_LENGTH = 80;

/** Path.GetInvalidFileNameChars on Windows, the strictest platform that matters. */
const INVALID_CHARACTERS = new Set(['<', '>', ':', '"', "/", "\\", "|", "?", "*"]);

function isRefused(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return INVALID_CHARACTERS.has(character) || code < 32 || code === 127;
}

function clean(value: string | null | undefined): string {
  if (!value) return "";
  let out = "";
  let lastWasSpace = false;
  for (const character of value) {
    if (isRefused(character) || /\s/.test(character)) {
      // Collapsed rather than repeated: a title with a newline in it must not become a name
      // with a run of blanks through the middle.
      if (out.length > 0 && !lastWasSpace) out += " ";
      lastWasSpace = true;
      continue;
    }
    out += character;
    lastWasSpace = false;
  }
  return out.replace(/[ .]+$/, "");
}

function truncate(value: string, max: number): string {
  const characters = Array.from(value);
  if (characters.length <= max) return value;
  return characters.slice(0, max).join("").replace(/[ .]+$/, "");
}

/** yyyy-MM-dd in the reader's own zone — the day they would say the meeting was on. */
export function localIsoDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function recordFileName({
  meetingTitle,
  kind,
  startedAt,
  language,
  extension,
}: {
  meetingTitle: string | null | undefined;
  kind: RecordDocumentKind;
  startedAt?: string | null;
  /** Upper-cased into "(JA)". Omit for the transcript as spoken and for recordings. */
  language?: string | null;
  extension: string;
}): string {
  const date = localIsoDate(startedAt);
  const title = truncate(clean(meetingTitle), MAX_TITLE_LENGTH) || "Meeting";
  const lang = clean(language).toUpperCase();
  const parts = [title, lang ? `${kind} (${lang})` : kind];
  if (date) parts.push(date);
  return `${parts.join(" - ")}.${extension.replace(/^\./, "")}`;
}
