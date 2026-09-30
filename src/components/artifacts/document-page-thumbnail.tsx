"use client";

import type { CSSProperties, ReactNode } from "react";

import {
  COLOR_BODY,
  COLOR_MUTED,
  COLOR_RULE,
  COLOR_SUBTLE,
  FONT,
  SIZE_BODY,
  SIZE_HEADING,
  SIZE_SMALL,
  SIZE_TITLE,
} from "@/lib/documents/record-docx-shell";
import {
  formatMeetingDate,
  kindLabel,
  recordHeaderRows,
  turnTimeLabel,
} from "@/lib/documents/record-document-layout";
import {
  savedSummaryDocumentModel,
  savedTranscriptDocumentModel,
} from "@/lib/documents/saved-record-documents";
import type { RecordDocumentMeta } from "@/lib/documents/record-documents";
import { readSummaryArtifact } from "@/lib/meeting/artifact-content";
import { entryStartedAt, type LibraryEntry } from "@/lib/meeting/artifact-library";

/**
 * The first page of the file a card's Download would hand over, drawn in HTML.
 *
 * WHY THE DOWNLOADED PAGE, NOT A TEXT EXCERPT
 *   Opening the card, reading it and downloading it now show one document. The thumbnail uses the
 *   Word writer's own numbers — `record-docx-shell.ts` for face, sizes and colours,
 *   `recordHeaderRows` for the header block, the same saved-body models the download builds from —
 *   so when the file changes, this changes with it, rather than drifting into a picture of a file
 *   nobody gets.
 *
 * Laid out in POINTS at twice the size and scaled to a half, so a page's proportions survive: a
 * thumbnail in pixels would have to restate every size by hand. The paper stays white in dark mode
 * because a Word page is white.
 *
 * Minutes use the GLOBAL layout (GlobalMinutesDocxWriter), never the Vietnamese form.
 *
 * Builds no Word file: the `docx` writer is only imported at a Download click.
 */

const pt = (halfPoints: number) => `${halfPoints / 2}pt`;
const hex = (color: string) => `#${color}`;

const PAGE_STYLE: CSSProperties = {
  width: "200%",
  transform: "scale(0.5)",
  transformOrigin: "top left",
  padding: "26pt 30pt",
  fontFamily: `${FONT}, Carlito, "Segoe UI", sans-serif`,
  fontSize: pt(SIZE_BODY),
  lineHeight: 1.15,
  color: hex(COLOR_BODY),
};

const SMALL: CSSProperties = { fontSize: pt(SIZE_SMALL) };

export function DocumentPageThumbnail({ entry }: { entry: LibraryEntry }) {
  return (
    <div
      aria-hidden="true"
      className="h-full select-none overflow-hidden rounded-t-[3px] border border-b-0 border-border bg-white shadow-[0_1px_4px_rgb(0_0_0/0.08)] transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none"
    >
      <div style={PAGE_STYLE}>
        {entry.kind === "transcript" ? (
          <TranscriptPage entry={entry} />
        ) : entry.kind === "summary" ? (
          <SummaryPage entry={entry} />
        ) : (
          <MinutesPage entry={entry} />
        )}
      </div>
    </div>
  );
}

function durationLabel(seconds: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function metaFor(entry: LibraryEntry, extra: Partial<RecordDocumentMeta> = {}): RecordDocumentMeta {
  return {
    meetingTitle: entry.roomTitle,
    startedAt: entryStartedAt(entry),
    durationLabel: durationLabel(entry.durationSeconds),
    hostName: entry.hostName,
    ...extra,
  };
}

/** The kind label, the title and the header table — `recordTitleBlock` in the Word writer. */
function TitleBlock({
  meta,
  kind,
  templateLabel,
}: {
  meta: RecordDocumentMeta;
  kind: "Transcript" | "Summary";
  templateLabel?: string | null;
}) {
  const rows = recordHeaderRows(meta, { templateLabel });
  return (
    <>
      <div style={{ ...SMALL, color: hex(COLOR_MUTED), letterSpacing: "1.2pt", marginBottom: "2pt" }}>
        {kindLabel(kind)}
      </div>
      <div style={{ fontSize: pt(SIZE_TITLE), fontWeight: 700, lineHeight: 1.1, marginBottom: "10pt" }}>
        {meta.meetingTitle}
      </div>
      {rows.length > 0 ? (
        <>
          <table style={{ ...SMALL, width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td style={{ width: "22%", color: hex(COLOR_MUTED), padding: "1pt 6pt 1pt 0", verticalAlign: "top" }}>
                    {row.label}
                  </td>
                  <td style={{ padding: "1pt 0", verticalAlign: "top" }}>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ borderBottom: `0.5pt solid ${hex(COLOR_RULE)}`, margin: "8pt 0 13pt" }} />
        </>
      ) : null}
    </>
  );
}

/** Enough turns to fill the card; the rest of the page is below the fold anyway. */
const PREVIEW_TURNS = 6;

function TranscriptPage({ entry }: { entry: LibraryEntry }) {
  const model = savedTranscriptDocumentModel(metaFor(entry), entry.rawBody ?? entry.body);
  const turns = model.entries.filter((item) => item.kind === "turn").slice(0, PREVIEW_TURNS);
  const speakers = [...new Set(turns.map((turn) => (turn.kind === "turn" ? turn.speakerName : "")))];
  return (
    <>
      <TitleBlock
        meta={{ ...model.meta, participants: speakers.filter(Boolean), languageLabel: "As spoken" }}
        kind="Transcript"
      />
      {turns.map((turn, index) =>
        turn.kind === "turn" ? (
          <div key={index}>
            <p style={{ fontWeight: 700, margin: "11pt 0 2pt" }}>
              {turn.speakerName}
              {turnTimeLabel(turn.elapsed, turn.clock) ? (
                <span style={{ ...SMALL, color: hex(COLOR_SUBTLE), fontWeight: 400 }}>
                  {"  "}
                  {turnTimeLabel(turn.elapsed, turn.clock)}
                </span>
              ) : null}
            </p>
            {turn.lines.map((line, lineIndex) => (
              <p key={lineIndex} style={{ margin: "0 0 3pt" }}>
                {line.text}
                {line.languageTag ? (
                  <span style={{ ...SMALL, color: hex(COLOR_SUBTLE) }}> [{line.languageTag}]</span>
                ) : null}
              </p>
            ))}
          </div>
        ) : null,
      )}
    </>
  );
}

function SummaryPage({ entry }: { entry: LibraryEntry }) {
  const source = entry.rawBody ?? entry.body;
  const model = savedSummaryDocumentModel(metaFor(entry), readSummaryArtifact(source), source);

  if (entry.absence === "generating") {
    return (
      <>
        <TitleBlock meta={model.meta} kind="Summary" />
        <Note>Writing the summary. It usually lands about 40 seconds after the meeting ends.</Note>
      </>
    );
  }

  return (
    <>
      <TitleBlock meta={model.meta} kind="Summary" templateLabel={model.templateLabel} />
      {model.insufficientDataMessage ? <Note>{model.insufficientDataMessage}</Note> : null}
      {model.overview ? <p style={{ margin: "0 0 7pt" }}>{model.overview}</p> : null}
      {model.sections.slice(0, 3).map((section) => (
        <div key={section.key}>
          <p style={{ fontSize: pt(SIZE_HEADING), fontWeight: 700, margin: "12pt 0 5pt" }}>{section.title}</p>
          <ul style={{ margin: 0, paddingLeft: "16pt", listStyle: "disc" }}>
            {section.items.slice(0, 4).map((item, index) => (
              <li key={index} style={{ marginBottom: "3pt" }}>
                {item.owner ? <b>{item.owner}: </b> : null}
                {item.text}
                {item.citations.length ? (
                  <span style={{ ...SMALL, color: hex(COLOR_SUBTLE) }}> [{item.citations.join(", ")}]</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

/** GlobalMinutesDocxWriter's status line, printed on the face of the document. */
function minutesStatusLine(statusLabel: string): string {
  if (statusLabel === "Approved") return "APPROVED";
  if (statusLabel === "Signed") return "SIGNED BY THE SECRETARY — awaiting the chair's approval";
  return "DRAFT — unsigned and not approved";
}

function MinutesPage({ entry }: { entry: LibraryEntry }) {
  const control: Array<[string, string | null | undefined]> = [
    ["Document ID", entry.title],
    ["Status", entry.statusLabel.toUpperCase()],
    ["Meeting closed", formatMeetingDate(entry.meetingEndedAt)],
    ["Secretary", entry.secretaryName],
    ["Chair", entry.chairName],
  ];
  const cell: CSSProperties = { border: `0.5pt solid ${hex(COLOR_BODY)}`, padding: "2pt 5pt", lineHeight: 1.25 };
  const bodyLines = (entry.body ?? "").split("\n").filter((line) => line.trim()).slice(0, 6);
  return (
    <>
      <div style={{ textAlign: "center", fontSize: "16pt", fontWeight: 700, marginBottom: "3pt" }}>
        MINUTES OF MEETING
      </div>
      <div style={{ textAlign: "center", fontSize: "12pt" }}>{entry.roomTitle}</div>
      <div style={{ ...SMALL, textAlign: "center", fontStyle: "italic", color: hex(COLOR_MUTED), margin: "2pt 0 12pt" }}>
        {minutesStatusLine(entry.statusLabel)}
      </div>
      <table style={{ ...SMALL, width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <tbody>
          {control
            .filter((row): row is [string, string] => Boolean(row[1]))
            .map(([label, value]) => (
              <tr key={label}>
                <td style={{ ...cell, width: "32%", fontWeight: 700 }}>{label}</td>
                <td style={cell}>{value}</td>
              </tr>
            ))}
        </tbody>
      </table>
      {/* What the minutes say, in the order they say it. Not under a numbered heading: the flat
          text here is agenda and proceedings, and the writer's "1 ATTENDANCE" would mislabel it. */}
      <div style={{ marginTop: "12pt" }}>
        {bodyLines.map((line, index) => (
          <p key={index} style={{ margin: "0 0 3pt" }}>
            {line}
          </p>
        ))}
      </div>
    </>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p style={{ ...SMALL, fontStyle: "italic", color: hex(COLOR_MUTED), margin: "0 0 12pt" }}>{children}</p>
  );
}
