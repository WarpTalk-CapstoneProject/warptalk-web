/**
 * What an /artifacts card shows of a document: its first lines, as markdown a renderer can draw.
 *
 * WHY THIS EXISTS (WT-699, Artifacts page)
 *   The card printed the stored body verbatim. A transcript export is markdown written by
 *   ArtifactsFinalizer, so every card opened on the same four lines of furniture —
 *
 *     # WarpTalk Transcription Room - Room: 01a0a94a-…
 *     Generated on: 2026-09-16 08:40:12 UTC
 *     ---
 *     **[Ngọc Kỳ (VI)]**: …
 *
 *   — followed by the pipeline's own `__MEETING_END__` sentinel as a line of dialogue from
 *   "System". A page of cards that all begin with a room UUID is a page of identical cards.
 *
 * WHAT IT DOES
 *   Drops the header block (title, "Generated on", the rule) so the preview starts at the content,
 *   drops the control markers and the `[System (SYSTEM)]` lines the transcript view already hides,
 *   and rewrites a speaker marker to a bold name. Every surviving line becomes its own paragraph,
 *   because the card is a preview of LINES — markdown would otherwise fold a transcript's single
 *   newlines into one run-on paragraph.
 *
 * Pure and relative-import-only so the node test runner covers it.
 */

import { isTranscriptControlMarker } from "../transcript/transcript-display.ts";

/** `**[Name (VI)]**: text` — one line of a transcript export. */
const SPEAKER_LINE = /^\*\*\[(.+?)(?:\s+\(([^()]*)\))?\]\*\*:\s*(.*)$/;

/** The export's header lines, recognised only while they lead the document. */
function isHeaderLine(line: string): boolean {
  return (
    /^#\s+WarpTalk Transcription Room\b/i.test(line) ||
    /^Generated on:/i.test(line) ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(line)
  );
}

function isSystemSpeaker(name: string, language: string | undefined): boolean {
  return name.trim().toLowerCase() === "system" || (language ?? "").trim().toLowerCase() === "system";
}

/**
 * One line of the body as the preview should read it, or null when it is not for a reader.
 */
function previewLine(line: string): string | null {
  const speaker = SPEAKER_LINE.exec(line);
  if (speaker) {
    const [, name, language, text] = speaker;
    if (isSystemSpeaker(name, language)) return null;
    if (isTranscriptControlMarker(text) || !text.trim()) return null;
    return `**${name.trim()}:** ${text.trim()}`;
  }
  if (isTranscriptControlMarker(line)) return null;
  return line;
}

/** Close a `**` left open by a cut, so a truncated bold run does not print its asterisks. */
function balanceEmphasis(text: string): string {
  const bold = (text.match(/\*\*/g) ?? []).length;
  return bold % 2 === 1 ? `${text}**` : text;
}

/**
 * The body's first lines as preview markdown — header stripped, sentinels dropped, speakers bold.
 *
 * Cut on whole lines once `maxChars` is reached; a single first line longer than that is cut at a
 * word boundary. The card clamps and fades what is left, so the budget only has to cover what a
 * card can show.
 */
export function artifactPreviewMarkdown(body: string | null | undefined, maxChars = 480): string {
  if (!body?.trim()) return "";

  const lines = body.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim());

  // The header block leads the document; strip it (and the blank lines inside it) only there, so
  // a `---` somebody wrote in a minutes body later on is left alone.
  let start = 0;
  while (start < lines.length && (lines[start] === "" || isHeaderLine(lines[start]))) start += 1;

  const kept: string[] = [];
  let used = 0;
  for (const raw of lines.slice(start)) {
    if (!raw) continue;
    const line = previewLine(raw);
    if (!line) continue;

    if (used + line.length > maxChars) {
      if (kept.length === 0) {
        const cut = line.slice(0, maxChars);
        const lastSpace = cut.lastIndexOf(" ");
        kept.push(`${balanceEmphasis((lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd())}…`);
      }
      break;
    }
    kept.push(line);
    used += line.length;
  }

  // Blank-line separated: each line is its own paragraph (or list item) in the rendered preview.
  return kept.join("\n\n");
}
