"use client";

/**
 * The minutes drawn as a DOCUMENT — an A4 page, not a form.
 *
 * WHY A PAGE AND NOT A PANEL
 *   The minutes used to render as a flat stack of small labelled key/value rows. Everything was
 *   there and nothing read as a record: no number on the face of it, no roll, no numbered
 *   decisions, no signatures. People trust a minutes document partly because of how it is SET —
 *   a title block, parts in order, a table of assignments, two names at the bottom — and a
 *   product that stores a real signed record while showing it as an admin screen throws that away
 *   for free. So the reading surface is a page: the same document the .docx export produces, on
 *   screen, at true scale.
 *
 * THE TRUE-SCALE TRICK
 *   `--mm` is one millimetre and `--pt` is one point AT THE SAME SCALE. Every dimension on the
 *   page — margins, type size, the space left for a handwritten signature — is written in those
 *   units, so changing `--mm` resizes the whole page while keeping every proportion exact. In
 *   `@media print` the two are redefined to real `1mm` and `1pt` and the same markup prints at
 *   actual size, which is why the print styles below are three rules rather than a second layout.
 *
 * WHY THE PAGE IS FIXED WHITE ON BLACK
 *   Everywhere else in this app colour comes from the semantic tokens and follows the viewer's
 *   theme. The page does not, and that is deliberate: a printed page is white, and a minutes
 *   document that turns dark grey in dark mode stops being a picture of the thing that will come
 *   out of the printer. The surround, the toolbar and every control around it are tokenised as
 *   usual; only the paper is fixed.
 *
 * EDITING A DOCUMENT-SHAPED SURFACE
 *   The hard part of this redesign. The secretary still edits per field, still in a plain
 *   textarea, for the reason the panel's own header gives — a rich-text surface would have to
 *   flatten a structured document to HTML and parse it back, and every round trip is a chance to
 *   lose a citation. What changed is that the textarea is now set IN the document: same face, same
 *   size, same measure, transparent, with a dashed rule underneath so it is visibly a field. The
 *   line does not move when editing starts, so the secretary is correcting the document they are
 *   looking at rather than a form that resembles it.
 *
 *   Every editable line carries the index of the stored section (and item) it came from, so a
 *   correction is written back to `content.sections[i]` exactly. The document reorders sections
 *   into parts for reading; nothing may reorder them on the way back.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import { cn } from "@/lib/utils";
import { sectionTitle } from "@/lib/meeting/meeting-summary";
import {
  closingSentence,
  externalGuestNotice,
  formatDocumentDate,
  formatDocumentMoment,
  formatDocumentTime,
  motionLines,
  numberClauses,
  planMinutesDocument,
  printablePolicyRows,
  provenanceLines,
  recordingNotice,
  referenceForAction,
  romanNumeral,
  type MinutesClause,
  type MinutesPolicyFacts,
  type MinutesTemplateId,
} from "@/lib/meeting/minutes-document";
import {
  counterpartOf,
  pairByCitation,
  type MeetingMinutesContent,
  type MeetingMinutesDto,
  type MinutesAttendance,
  type MinutesItem,
} from "@/types/meetingMinutes";

/**
 * `useLayoutEffect` warns when React renders on the server, and this component is server-rendered
 * like every other client component in the app. The measurement it does has no meaning without a
 * layout, so on the server it degrades to `useEffect`, which never runs there at all.
 */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* ─────────────────────────── The edit surface ─────────────────────────── */

/**
 * Writing back into the stored document, by stored position.
 *
 * Passed in rather than derived here so this component stays a rendering of a document and the
 * panel above it keeps ownership of the working copy — including the rule that leaving edit mode
 * discards it.
 */
export interface MinutesEditHandlers {
  setAgenda: (value: string) => void;
  setNotes: (value: string) => void;
  setSectionText: (sectionIndex: number, value: string) => void;
  setItemText: (sectionIndex: number, itemIndex: number, value: string) => void;
}

export interface MinutesDocumentProps {
  minutes: MeetingMinutesDto;
  content: MeetingMinutesContent;
  template: MinutesTemplateId;
  editing: boolean;
  edits: MinutesEditHandlers;
  /** Jump to the moment a line came from. Absent when the page has no transcript to jump to. */
  onSeek?: (atMs: number) => void;
  /**
   * The LETTERHEAD IS THE WORKSPACE'S. Never WarpTalk's — the whole argument for making this look
   * like a document is that it should look like a document that organisation drew up, and a
   * vendor's logo on a customer's legal record reads as a watermark. WarpTalk is named in exactly
   * one place, the provenance line in the footer, where it is a disclosure and not branding.
   */
  branding: { name: string | null; logoUrl: string | null };
  policy: MinutesPolicyFacts;
  /** The room's `saveTranscript`. null means the room has not loaded — print no notice at all. */
  transcriptKept?: boolean | null;
  /** The workspace's configured zone, so the document states when the meeting opened THERE. */
  timeZone?: string | null;
  /** Dashed margin box, for somebody checking the page is laid out to the right measure. */
  showGuides: boolean;
  statusLabel: string;
}

/* ─────────────────────────── Leaf pieces, shared by both templates ─────────────────────────── */

function formatOffset(atMs: number | null | undefined): string | null {
  if (atMs == null || atMs < 0) return null;
  const total = Math.floor(atMs / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * A citation, and it stays a control.
 *
 * This is the one thing a Word file cannot do and the reason people keep this document in the
 * product rather than only in their filing system: every claim on the page can be checked against
 * the second of the recording it came from. The redesign was not allowed to cost a single one, so
 * a citation renders as a button wherever the page can seek and as plain text — never as nothing —
 * where it cannot.
 */
function Citation({
  atMs,
  onSeek,
}: {
  atMs: number | null | undefined;
  onSeek?: (atMs: number) => void;
}) {
  const offset = formatOffset(atMs);
  if (!offset) return null;

  if (!onSeek || atMs == null) {
    return <span className="mdoc-cite">[{offset}]</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onSeek(atMs)}
      aria-label={`Play the recording from ${offset}`}
      className="mdoc-cite mdoc-cite-button"
    >
      [{offset}]
    </button>
  );
}

/**
 * A field set in the page: the document's own type, with a dashed rule to say it can be typed in.
 *
 * Auto-sized to its content because a document does not have scrollbars inside its paragraphs. The
 * measurement runs on every value change, and before paint, so a growing line never flashes at the
 * wrong height.
 */
function DocField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      rows={1}
      className="mdoc-field"
    />
  );
}

/**
 * One line of body text, editable in place, with its citation on the end.
 *
 * The citation sits outside the field on purpose. It is not text the secretary typed and it is not
 * text they may retype — it is the anchor into the recording, and letting it into an editable
 * string is how it gets deleted by somebody rewording the sentence around it.
 */
function ClauseText({
  clause,
  editing,
  edits,
  onSeek,
  translated,
  lead,
}: {
  clause: MinutesClause;
  editing: boolean;
  edits: MinutesEditHandlers;
  onSeek?: (atMs: number) => void;
  translated: { language: string; text: string } | null;
  /** Printed before the text, inside the same paragraph: an item number, or a bold lead-in. */
  lead?: React.ReactNode;
}) {
  return (
    <>
      <p className="mdoc-body">
        {lead}
        {editing ? (
          <DocField
            value={clause.text}
            placeholder="Write this line."
            onChange={(next) =>
              clause.itemIndex == null
                ? edits.setSectionText(clause.sectionIndex, next)
                : edits.setItemText(clause.sectionIndex, clause.itemIndex, next)
            }
          />
        ) : (
          <span>{clause.text}</span>
        )}
        {clause.owner ? <span className="mdoc-owner"> — {clause.owner}</span> : null}{" "}
        <Citation atMs={clause.atMs} onSeek={onSeek} />
      </p>
      {translated ? (
        <p className="mdoc-translated">
          <span className="mdoc-lang">[{translated.language}]</span> {translated.text}
        </p>
      ) : null}
    </>
  );
}

/**
 * The dashed margin box.
 *
 * Not decoration: the left margin being wider than the right is the first thing a Vietnamese
 * reader uses to tell a properly drawn-up document from a web page that was printed, and being
 * able to see the measure is how somebody confirms the export will match.
 */
function Guides({ template }: { template: MinutesTemplateId }) {
  const margins =
    template === "global-en"
      ? { top: "25.4mm", bottom: "25.4mm", left: "25.4mm", right: "25.4mm" }
      : { top: "20mm", bottom: "20mm", left: "30mm", right: "20mm" };

  return (
    <div className="mdoc-guides" aria-hidden>
      <div className="mdoc-guide-box" />
      <span className="mdoc-guide mdoc-guide-l">{margins.left}</span>
      <span className="mdoc-guide mdoc-guide-r">{margins.right}</span>
      <span className="mdoc-guide mdoc-guide-t">{margins.top}</span>
      <span className="mdoc-guide mdoc-guide-b">{margins.bottom}</span>
    </div>
  );
}

/** The workspace's own letterhead, or nothing at all. Never filled in with the vendor's. */
function Letterhead({ branding }: { branding: { name: string | null; logoUrl: string | null } }) {
  if (!branding.name && !branding.logoUrl) return null;

  return (
    <div className="mdoc-letterhead">
      {/* A plain <img>: the mark has to scale with --mm like everything else on the page, and
          next/image's own sizing and optimisation pipeline fights a layout measured in
          millimetres. It is decorative — the organisation's name is beside it in text — so it
          carries an empty alt rather than a description a screen reader would read twice. */}
      {branding.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={branding.logoUrl} alt="" className="mdoc-logo" />
      ) : null}
      {branding.name ? <span className="mdoc-org">{branding.name}</span> : null}
    </div>
  );
}

/**
 * The document-control / record-handling rows, printed only where there is something to print.
 *
 * `leading` carries the rows that are columns on the record itself — the number, the version —
 * which always exist. Everything after them comes from `printablePolicyRows`, which returns only
 * what the product actually holds, so a workspace that has configured nothing gets a table with
 * the identity rows alone rather than a table of blanks.
 */
function PolicyRows({
  facts,
  dense,
  leading = [],
}: {
  facts: MinutesPolicyFacts;
  dense: boolean;
  leading?: { key: string; label: string; value: string }[];
}) {
  const rows = [...leading, ...printablePolicyRows(facts)];
  if (rows.length === 0) return null;

  return (
    <table className={cn("mdoc-table", dense && "mdoc-ctrl")}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <th scope="row">{row.label}</th>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The assignments table.
 *
 * There is no Due column, and its absence is the point: `MinutesItem` carries text, an owner and a
 * citation, and nothing in this product records a deadline against a line of the minutes. A column
 * of blanks headed "Due" invites somebody to read the empty cells as "no deadline" rather than as
 * "never recorded", so the column that would be a guess is simply not printed. The Ref column
 * takes its place — it points back at the clause that produced the task, which the document does
 * know, because both cite the same moment.
 */
function ActionTable({
  items,
  sectionIndex,
  editing,
  edits,
  onSeek,
  clauses,
  showRef,
}: {
  items: MinutesItem[];
  sectionIndex: number;
  editing: boolean;
  edits: MinutesEditHandlers;
  onSeek?: (atMs: number) => void;
  clauses: MinutesClause[];
  showRef: boolean;
}) {
  if (items.length === 0) {
    return <p className="mdoc-body">No assignments were recorded.</p>;
  }

  return (
    <table className="mdoc-table mdoc-actions">
      <thead>
        <tr>
          <th className="mdoc-col-no">No.</th>
          <th>Task</th>
          <th className="mdoc-col-owner">Assigned to</th>
          {/* "Ref" only where the layout actually prints clause numbers to refer to. The
              Vietnamese template numbers its parts in Roman numerals and its lines within a part,
              which is not a citable address, so there it is simply the moment on the record. */}
          <th className="mdoc-col-ref">{showRef ? "Ref / recorded at" : "Recorded at"}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, itemIndex) => {
          const reference = showRef ? referenceForAction(item, clauses) : null;
          return (
            <tr key={itemIndex}>
              <td>{itemIndex + 1}</td>
              <td>
                {editing ? (
                  <DocField
                    value={item.text}
                    placeholder="Write this task."
                    onChange={(next) => edits.setItemText(sectionIndex, itemIndex, next)}
                  />
                ) : (
                  item.text
                )}
              </td>
              {/* An owner nobody named prints as an ellipsis, the way a blank prints on a paper
                  form — the same rule the .docx writer already follows for a missing date. */}
              <td>{item.owner || "…………"}</td>
              {/* The clause reference is printed BESIDE the citation, never instead of it. The
                  reference tells a reader where in the document the task came from; the citation
                  is the control that plays the moment it was said, and this redesign was not
                  allowed to cost one. */}
              <td>
                {reference ? <span className="mdoc-ref">{reference} </span> : null}
                <Citation atMs={item.atMs} onSeek={onSeek} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Who was there, as a roll. Two renderings of the same facts; this is the Vietnamese one. */
function RollList({
  attendance,
  chairId,
  secretaryId,
}: {
  attendance: MinutesAttendance;
  chairId?: string | null;
  secretaryId?: string | null;
}) {
  return (
    <>
      <p className="mdoc-body mdoc-em">
        Present: {attendance.presentCount || attendance.present.length}
        {attendance.invitedCount > 0 ? ` of ${attendance.invitedCount} invited` : ""}
      </p>
      {attendance.present.length === 0 ? (
        <p className="mdoc-body mdoc-indent">Nobody was recorded entering the room.</p>
      ) : (
        attendance.present.map((person, index) => (
          <p key={person.participantId} className="mdoc-body mdoc-indent">
            {index + 1}. {person.name}
            {roleSuffix(person.participantId, person.role, chairId, secretaryId)}
            {person.isExternal ? " — guest from outside the workspace" : ""}
          </p>
        ))
      )}

      {attendance.absent.length > 0 ? (
        <>
          <p className="mdoc-body mdoc-em">Absent: {attendance.absent.length}</p>
          {attendance.absent.map((person, index) => (
            <p key={person.participantId} className="mdoc-body mdoc-indent">
              {index + 1}. {person.name}
              {person.reason ? ` — ${person.reason}` : ""}
            </p>
          ))}
        </>
      ) : null}

      {/* The rule is printed beside the verdict, as it was before this redesign: a bare
          "met/not met" does not say what bar was applied, and quorum is exactly the line
          somebody later disputes. */}
      {attendance.quorumMet != null ? (
        <p className="mdoc-body">
          Quorum: {attendance.quorumMet ? "met" : "not met"}
          {attendance.quorumRule ? ` — ${attendance.quorumRule}` : ""}
        </p>
      ) : null}
    </>
  );
}

function roleSuffix(
  participantId: string,
  role: string | null | undefined,
  chairId?: string | null,
  secretaryId?: string | null,
): string {
  // Matched on the participant id the minutes themselves recorded, not on a name, and not on the
  // room's live host flag: the chair of record is whoever the document says approved it.
  if (chairId && participantId === chairId) return " — Chair";
  if (secretaryId && participantId === secretaryId) return " — Secretary";
  if (!chairId && role === "HOST") return " — Chair";
  return "";
}

/** The same roll as one sentence, which is how the international layout states it. */
function rollSentence(
  attendance: MinutesAttendance,
  chairId?: string | null,
  secretaryId?: string | null,
): string {
  if (attendance.present.length === 0) return "Nobody was recorded entering the room.";
  return attendance.present
    .map((person) => {
      if (chairId && person.participantId === chairId) return `${person.name} (chair)`;
      if (secretaryId && person.participantId === secretaryId) return `${person.name} (secretary)`;
      if (person.isExternal) return `${person.name} (guest)`;
      return person.name;
    })
    .join(", ");
}

/** The footer: what this document is, who made it, and what was done to the meeting itself. */
function DocumentFooter({
  minutes,
  statusLabel,
  formatMoment,
  policy,
  transcriptKept,
  attendance,
}: {
  minutes: MeetingMinutesDto;
  statusLabel: string;
  formatMoment: (value: string | null | undefined) => string | null;
  policy: MinutesPolicyFacts;
  transcriptKept?: boolean | null;
  attendance: MinutesAttendance;
}) {
  const provenance = provenanceLines(
    {
      minutesNo: minutes.minutesNo,
      version: minutes.version,
      statusLabel,
      draftedByEngine: minutes.draftedByEngine,
      draftedAt: minutes.draftedAt,
      secretaryName: minutes.secretaryName,
      secretarySignedAt: minutes.secretarySignedAt,
      editCountVsDraft: minutes.editCountVsDraft,
      chairName: minutes.chairName,
      chairApprovedAt: minutes.chairApprovedAt,
    },
    formatMoment,
  );

  const recording = recordingNotice({
    transcriptKept,
    artifactRetentionDays: policy.artifactRetentionDays,
    retentionFrom: policy.retentionFrom,
  });
  const guests = externalGuestNotice(attendance);

  return (
    <div className="mdoc-foot">
      {provenance.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {recording ? <p>{recording}</p> : null}
      {guests ? <p>{guests}</p> : null}
    </div>
  );
}

/* ─────────────────────────── Bilingual pairing ─────────────────────────── */

/**
 * Which translated line, if any, may be printed under each original.
 *
 * Keyed by stored position so a clause can look itself up in constant time. The pairing rule is
 * `pairByCitation` unchanged — pair on the citation, never on position, all-or-nothing per section
 * — because a translated line printed beside the wrong original attributes a decision to something
 * nobody decided, and this document is signed.
 */
function buildTranslationIndex(
  content: MeetingMinutesContent,
): Map<string, { language: string; text: string }> {
  const index = new Map<string, { language: string; text: string }>();
  const translations = content.translations;
  if (!translations) return index;

  // Deterministic language order, so the same document does not pick a different translation
  // between renders.
  const languages = Object.keys(translations).sort();

  content.sections.forEach((section, sectionIndex) => {
    for (const language of languages) {
      const counterpart = counterpartOf(section, translations[language]);
      if (!counterpart) continue;

      if (section.kind === "paragraph") {
        if (counterpart.kind === "paragraph" && counterpart.text) {
          index.set(`${sectionIndex}:null`, { language, text: counterpart.text });
          break;
        }
        continue;
      }

      const pairs = pairByCitation(section.items, counterpart.items);
      if (!pairs) continue;
      pairs.forEach((pair, itemIndex) => {
        index.set(`${sectionIndex}:${itemIndex}`, { language, text: pair.translated.text });
      });
      break;
    }
  });

  return index;
}

/* ─────────────────────────── The page ─────────────────────────── */

export function MinutesDocument(props: MinutesDocumentProps) {
  const { content, template, showGuides } = props;

  const translationIndex = useMemo(() => buildTranslationIndex(content), [content]);

  return (
    <div className="mdoc-print-root">
      <MinutesDocumentStyles />
      <div className="mdoc-wrap">
        <div
          className={cn("mdoc-page", template === "global-en" && "mdoc-iso")}
          // The document is a document to a screen reader too: a landmark with a name, so it can
          // be jumped to rather than waded into.
          role="document"
          aria-label={`Minutes ${props.minutes.minutesNo}`}
        >
          {showGuides ? <Guides template={template} /> : null}
          {template === "global-en" ? (
            <GlobalBody {...props} translationIndex={translationIndex} />
          ) : (
            <VietnameseBody {...props} translationIndex={translationIndex} />
          )}
        </div>
      </div>
    </div>
  );
}

type BodyProps = MinutesDocumentProps & {
  translationIndex: Map<string, { language: string; text: string }>;
};

/* ─────────────────────────── vn-nd30 ─────────────────────────── */

/**
 * The Vietnamese layout: A4, 20/20/30/20 mm margins, serif body, parts in Roman numerals, two
 * signature columns with room left for a pen.
 *
 * The wide left margin is not a style choice — it is the space left for a staple or a file clip,
 * and it is the first signal a Vietnamese reader reads as "this was drawn up properly". The
 * numbering, the centred title block and the two-column signature are the rest of that signal.
 *
 * The LABELS ARE ENGLISH. This app's interface is English throughout; what makes this template
 * Vietnamese is the measure, the face, the numbering and the order — not the words.
 */
function VietnameseBody({
  minutes,
  content,
  template,
  editing,
  edits,
  onSeek,
  branding,
  policy,
  transcriptKept,
  timeZone,
  statusLabel,
  translationIndex,
}: BodyProps) {
  const plan = useMemo(() => planMinutesDocument(content.sections), [content.sections]);
  const moment = (value: string | null | undefined) =>
    formatDocumentMoment(value, template, timeZone);

  // Parts are numbered as they are printed, so a meeting that produced no decisions does not leave
  // a hole where III should have been. A reader quoting "part IV" must be quoting the part they
  // can see.
  let partNumber = 0;
  const attendancePart = ++partNumber;
  const proceedingsPart = ++partNumber;
  const decisionsPart =
    plan.decisions.length > 0 || content.votes.length > 0 ? ++partNumber : null;
  const actionsPart = plan.actions.length > 0 ? ++partNumber : null;
  const notesPart = content.notes || editing ? ++partNumber : null;

  const proceedings = numberClauses(proceedingsPart, plan.proceedings, sectionTitle);
  const decisions = decisionsPart ? numberClauses(decisionsPart, plan.decisions, sectionTitle) : [];

  return (
    <>
      <Letterhead branding={branding} />

      <p className="mdoc-no">No.: {minutes.minutesNo}</p>
      <p className="mdoc-title">Minutes of meeting</p>
      {content.meetingTitle ? <p className="mdoc-subtitle">{content.meetingTitle}</p> : null}
      {/* The draft status is printed on the FACE of the document in both templates. A record that
          only says "draft" in the app's chrome becomes an unmarked record the moment somebody
          prints it, which is the moment it matters most. */}
      <p className="mdoc-status">{statusLabel}</p>

      <p className="mdoc-body">Opened: {moment(content.openedAt) ?? "…………"}</p>
      <p className="mdoc-body">Closed: {moment(content.closedAt) ?? "…………"}</p>
      {content.scheduledAt ? (
        // Kept beside the real opening time, because "started late" is itself a fact.
        <p className="mdoc-body">Scheduled for: {moment(content.scheduledAt)}</p>
      ) : null}
      <p className="mdoc-body">Location: {content.location || "…………"}</p>

      <h2 className="mdoc-part">{romanNumeral(attendancePart)}. Attendance</h2>
      <RollList
        attendance={content.attendance}
        chairId={minutes.chairParticipantId}
        secretaryId={minutes.secretaryParticipantId}
      />

      <h2 className="mdoc-part">{romanNumeral(proceedingsPart)}. Proceedings</h2>
      {content.agenda || editing ? (
        <p className="mdoc-body">
          <span className="mdoc-run">Agenda. </span>
          {editing ? (
            <DocField
              value={content.agenda ?? ""}
              placeholder="No agenda recorded."
              onChange={edits.setAgenda}
            />
          ) : (
            content.agenda
          )}
        </p>
      ) : null}
      {proceedings.length === 0 ? (
        <p className="mdoc-body">
          No body was carried into these minutes from the meeting&apos;s summary.
        </p>
      ) : (
        proceedings.map((clause) => (
          <div key={`${clause.sectionIndex}:${clause.itemIndex}`}>
            {clause.heading ? <p className="mdoc-sub">{clause.heading}</p> : null}
            <ClauseText
              clause={clause}
              editing={editing}
              edits={edits}
              onSeek={onSeek}
              lead={<span className="mdoc-run">{clause.ordinal}. </span>}
              translated={
                translationIndex.get(`${clause.sectionIndex}:${clause.itemIndex}`) ?? null
              }
            />
          </div>
        ))
      )}

      {decisionsPart ? (
        <>
          <h2 className="mdoc-part">{romanNumeral(decisionsPart)}. Decisions</h2>
          {decisions.map((clause) => (
            <div key={`${clause.sectionIndex}:${clause.itemIndex}`} className="mdoc-indent">
              <ClauseText
                clause={clause}
                editing={editing}
                edits={edits}
                onSeek={onSeek}
                lead={<span className="mdoc-run">{clause.ordinal}. </span>}
                translated={
                  translationIndex.get(`${clause.sectionIndex}:${clause.itemIndex}`) ?? null
                }
              />
            </div>
          ))}
          {content.votes.map((vote, index) => {
            const lines = motionLines(vote);
            return (
              <div key={index} className="mdoc-indent">
                <p className="mdoc-body">
                  <span className="mdoc-run">Motion. </span>
                  {vote.topic} <Citation atMs={vote.atMs} onSeek={onSeek} />
                </p>
                {lines.attribution ? <p className="mdoc-body">{lines.attribution}</p> : null}
                <p className="mdoc-body">{lines.outcome}</p>
              </div>
            );
          })}
        </>
      ) : null}

      {actionsPart ? (
        <>
          <h2 className="mdoc-part">{romanNumeral(actionsPart)}. Action assignments</h2>
          {plan.actions.map(({ section, index }) => (
            <ActionTable
              key={index}
              items={section.items ?? []}
              sectionIndex={index}
              editing={editing}
              edits={edits}
              onSeek={onSeek}
              clauses={[]}
              showRef={false}
            />
          ))}
        </>
      ) : null}

      {notesPart ? (
        <>
          <h2 className="mdoc-part">{romanNumeral(notesPart)}. Notes of the secretary</h2>
          {editing ? (
            <DocField
              value={content.notes ?? ""}
              placeholder="No additional notes."
              onChange={edits.setNotes}
            />
          ) : (
            <p className="mdoc-body mdoc-pre">{content.notes}</p>
          )}
        </>
      ) : null}

      <p className="mdoc-body mdoc-closing">{closingSentence(content, template, timeZone)}</p>

      <div className="mdoc-sig">
        <div>
          <b>Secretary</b>
          <i>(Sign and print name)</i>
          <div className="mdoc-sig-space" />
          <span>{minutes.secretaryName || "…………………………"}</span>
        </div>
        <div>
          <b>Chair</b>
          <i>(Sign and print name)</i>
          <div className="mdoc-sig-space" />
          <span>{minutes.chairName || "…………………………"}</span>
        </div>
      </div>

      <h2 className="mdoc-part mdoc-part-quiet">Record handling</h2>
      <PolicyRows facts={policy} dense={false} />

      <DocumentFooter
        minutes={minutes}
        statusLabel={statusLabel}
        formatMoment={moment}
        policy={policy}
        transcriptKept={transcriptKept}
        attendance={content.attendance}
      />
    </>
  );
}

/* ─────────────────────────── global-en ─────────────────────────── */

/**
 * The international layout: A4, 25.4 mm on all four sides, sans body, decimal clause numbering,
 * a document-control table at the head and signature lines rather than signature columns.
 *
 * The decimal numbering is the substantive difference, not a stylistic one. "Per clause 4.2" is
 * something a person can write in an email and a recipient can find; "in the middle of the
 * decisions part" is not. That is also why the action table's Ref column only exists here — it
 * points back at a clause number this layout actually prints.
 */
function GlobalBody({
  minutes,
  content,
  template,
  editing,
  edits,
  onSeek,
  branding,
  policy,
  transcriptKept,
  timeZone,
  statusLabel,
  translationIndex,
}: BodyProps) {
  const plan = useMemo(() => planMinutesDocument(content.sections), [content.sections]);
  const moment = (value: string | null | undefined) =>
    formatDocumentMoment(value, template, timeZone);

  let partNumber = 0;
  const detailsPart = ++partNumber;
  const attendancePart = ++partNumber;
  const mattersPart = ++partNumber;
  const decisionsPart =
    plan.decisions.length > 0 || content.votes.length > 0 ? ++partNumber : null;
  const actionsPart = plan.actions.length > 0 ? ++partNumber : null;
  const notesPart = content.notes || editing ? ++partNumber : null;
  const adjournmentPart = ++partNumber;

  const matters = numberClauses(mattersPart, plan.proceedings, sectionTitle);
  const decisions = decisionsPart ? numberClauses(decisionsPart, plan.decisions, sectionTitle) : [];
  // The Ref column may point at anything the document numbered, so both parts are offered.
  const referenceable = [...matters, ...decisions];

  const openedDate = formatDocumentDate(content.openedAt, template, timeZone);
  const openedTime = formatDocumentTime(content.openedAt, template, timeZone);
  const closedTime = formatDocumentTime(content.closedAt, template, timeZone);

  return (
    <>
      <Letterhead branding={branding} />

      {/* Document control. The identity rows always exist — they are columns on the record — and
          everything below them is whatever the policy block could honestly fill in. */}
      <PolicyRows
        facts={policy}
        dense
        leading={[
          { key: "id", label: "Document ID", value: minutes.minutesNo },
          {
            key: "version",
            label: "Version / Status",
            value: `${minutes.version} — ${statusLabel}`,
          },
        ]}
      />

      <p className="mdoc-label">Meeting minutes</p>
      <p className="mdoc-title">{content.meetingTitle || "Untitled meeting"}</p>
      {branding.name ? <p className="mdoc-subtitle">{branding.name}</p> : null}
      <p className="mdoc-status">{statusLabel}</p>

      <h2 className="mdoc-part">{detailsPart} Meeting details</h2>
      <Clause n={`${detailsPart}.1`}>Date: {openedDate ?? "not recorded"}</Clause>
      <Clause n={`${detailsPart}.2`}>
        Time: {openedTime ?? "not recorded"}
        {closedTime ? ` to ${closedTime}` : ""}
      </Clause>
      <Clause n={`${detailsPart}.3`}>Location: {content.location || "not recorded"}</Clause>
      {minutes.chairName || minutes.secretaryName ? (
        <Clause n={`${detailsPart}.4`}>
          {minutes.chairName ? `Chair: ${minutes.chairName}` : null}
          {minutes.chairName && minutes.secretaryName ? " · " : null}
          {minutes.secretaryName ? `Secretary: ${minutes.secretaryName}` : null}
        </Clause>
      ) : null}

      <h2 className="mdoc-part">{attendancePart} Attendance</h2>
      <Clause n={`${attendancePart}.1`}>
        Present
        {content.attendance.invitedCount > 0
          ? `, ${content.attendance.presentCount || content.attendance.present.length} of ${content.attendance.invitedCount} invited`
          : ""}
        : {rollSentence(content.attendance, minutes.chairParticipantId, minutes.secretaryParticipantId)}
      </Clause>
      {content.attendance.absent.length > 0 ? (
        <Clause n={`${attendancePart}.2`}>
          Apologies, {content.attendance.absent.length}:{" "}
          {content.attendance.absent
            .map((person) => (person.reason ? `${person.name} (${person.reason})` : person.name))
            .join(", ")}
          .
        </Clause>
      ) : null}
      {content.attendance.quorumMet != null ? (
        <Clause n={`${attendancePart}.${content.attendance.absent.length > 0 ? 3 : 2}`}>
          Quorum: {content.attendance.quorumMet ? "met" : "not met"}
          {content.attendance.quorumRule ? ` — ${content.attendance.quorumRule}` : ""}.
        </Clause>
      ) : null}

      <h2 className="mdoc-part">{mattersPart} Matters discussed</h2>
      {/* The agenda leads the part rather than taking a clause number of its own: it is what the
          meeting set out to do, not one of the things it discussed, and numbering it would push
          every matter's number one out of step with the meeting's own order. */}
      {content.agenda || editing ? (
        <p className="mdoc-body">
          <span className="mdoc-run">Agenda. </span>
          {editing ? (
            <DocField
              value={content.agenda ?? ""}
              placeholder="No agenda recorded."
              onChange={edits.setAgenda}
            />
          ) : (
            content.agenda
          )}
        </p>
      ) : null}
      {matters.length === 0 ? (
        <p className="mdoc-body">
          No body was carried into these minutes from the meeting&apos;s summary.
        </p>
      ) : (
        matters.map((clause) => (
          <div className="mdoc-cl" key={`${clause.sectionIndex}:${clause.itemIndex}`}>
            <span className="mdoc-n">{clause.clause}</span>
            <div>
              <ClauseText
                clause={clause}
                editing={editing}
                edits={edits}
                onSeek={onSeek}
                lead={
                  clause.heading ? <span className="mdoc-run">{clause.heading}. </span> : null
                }
                translated={
                  translationIndex.get(`${clause.sectionIndex}:${clause.itemIndex}`) ?? null
                }
              />
            </div>
          </div>
        ))
      )}

      {decisionsPart ? (
        <>
          <h2 className="mdoc-part">{decisionsPart} Decisions and motions</h2>
          {decisions.map((clause) => (
            <div className="mdoc-cl" key={`${clause.sectionIndex}:${clause.itemIndex}`}>
              <span className="mdoc-n">{clause.clause}</span>
              <div>
                <ClauseText
                  clause={clause}
                  editing={editing}
                  edits={edits}
                  onSeek={onSeek}
                  translated={
                    translationIndex.get(`${clause.sectionIndex}:${clause.itemIndex}`) ?? null
                  }
                />
              </div>
            </div>
          ))}
          {content.votes.map((vote, index) => {
            const lines = motionLines(vote);
            return (
              <div className="mdoc-cl" key={`motion-${index}`}>
                <span className="mdoc-n">
                  {decisionsPart}.{decisions.length + index + 1}
                </span>
                <div>
                  <p className="mdoc-body">
                    <span className="mdoc-run">Motion: </span>
                    {vote.topic} <Citation atMs={vote.atMs} onSeek={onSeek} />
                  </p>
                  {lines.attribution ? <p className="mdoc-body">{lines.attribution}</p> : null}
                  <p className="mdoc-body">{lines.outcome}</p>
                </div>
              </div>
            );
          })}
        </>
      ) : null}

      {actionsPart ? (
        <>
          <h2 className="mdoc-part">{actionsPart} Action items</h2>
          {plan.actions.map(({ section, index }) => (
            <ActionTable
              key={index}
              items={section.items ?? []}
              sectionIndex={index}
              editing={editing}
              edits={edits}
              onSeek={onSeek}
              clauses={referenceable}
              showRef
            />
          ))}
        </>
      ) : null}

      {notesPart ? (
        <>
          <h2 className="mdoc-part">{notesPart} Notes of the secretary</h2>
          {editing ? (
            <DocField
              value={content.notes ?? ""}
              placeholder="No additional notes."
              onChange={edits.setNotes}
            />
          ) : (
            <p className="mdoc-body mdoc-pre">{content.notes}</p>
          )}
        </>
      ) : null}

      <h2 className="mdoc-part">{adjournmentPart} Adjournment</h2>
      <Clause n={`${adjournmentPart}.1`}>{closingSentence(content, template, timeZone)}</Clause>

      <div className="mdoc-sig mdoc-sig-lines">
        <p className="mdoc-label">Signatures</p>
        <p className="mdoc-body">
          Secretary — {minutes.secretaryName || "…………………………"}
          {minutes.secretarySignedAt
            ? ` · signed ${moment(minutes.secretarySignedAt)}`
            : " · not signed"}
        </p>
        <p className="mdoc-body">
          Chair — {minutes.chairName || "…………………………"}
          {minutes.chairApprovedAt
            ? ` · approved ${moment(minutes.chairApprovedAt)}`
            : " · approval pending"}
        </p>
      </div>

      <DocumentFooter
        minutes={minutes}
        statusLabel={statusLabel}
        formatMoment={moment}
        policy={policy}
        transcriptKept={transcriptKept}
        attendance={content.attendance}
      />
    </>
  );
}

/** One numbered clause of the international layout: hanging number, body in the second column. */
function Clause({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="mdoc-cl">
      <span className="mdoc-n">{n}</span>
      <div>
        <p className="mdoc-body">{children}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────── The page's own CSS ─────────────────────────── */

/**
 * Injected as a plain `<style>` element, following the same pattern the printable invoice in
 * AdminInvoicesTab uses.
 *
 * It is not Tailwind for two reasons. Every dimension here is a multiple of `--mm` or `--pt` at
 * the page's own scale, which utility classes cannot express; and the print rules have to reach
 * outside this component — see the comment on the print block — which a utility on an element
 * cannot do either.
 */
function MinutesDocumentStyles() {
  // Mounted once per document. Two panels on one screen would emit the rules twice, which is
  // harmless: the declarations are identical, so the cascade lands in the same place.
  return (
    <style>{`
.mdoc-wrap {
  /* One millimetre and one point, at the same scale. Change --mm and the whole page resizes
     while every margin, face and gap keeps its true proportion. */
  --mm: 2.95px;
  --pt: 1.0413px;
  display: flex;
  justify-content: center;
  padding: 20px 12px 28px;
  overflow-x: auto;
}
.mdoc-page {
  position: relative;
  flex: none;
  width: calc(210 * var(--mm));
  min-height: calc(297 * var(--mm));
  /* Fixed white on black, in a codebase that otherwise takes every colour from the theme tokens:
     a printed page does not change colour with the viewer's theme, and a minutes document that
     went dark grey in dark mode would stop being a picture of what comes out of the printer. */
  background: #ffffff;
  color: #000000;
  box-shadow: 0 2px 6px rgba(0,0,0,.18), 0 18px 44px -18px rgba(0,0,0,.45);
  padding: calc(20 * var(--mm)) calc(20 * var(--mm)) calc(20 * var(--mm)) calc(30 * var(--mm));
  font-family: "Times New Roman", Times, serif;
  font-size: calc(13 * var(--pt));
  line-height: 1.5;
}
.mdoc-page * { color: #000000; }

.mdoc-letterhead { display: flex; align-items: center; gap: calc(3 * var(--mm)); margin-bottom: calc(8 * var(--pt)); }
.mdoc-logo { height: calc(12 * var(--mm)); width: auto; object-fit: contain; }
.mdoc-org { font-weight: 700; font-size: calc(12 * var(--pt)); letter-spacing: .01em; }

.mdoc-body { margin: 0 0 calc(6 * var(--pt)); }
.mdoc-pre { white-space: pre-wrap; }
.mdoc-em { font-style: italic; }
.mdoc-run { font-weight: 700; }
.mdoc-indent { padding-left: calc(8 * var(--mm)); }
.mdoc-closing { margin-top: calc(10 * var(--pt)); }
.mdoc-no { text-align: right; font-size: calc(11 * var(--pt)); margin: 0 0 calc(6 * var(--pt)); }
.mdoc-title {
  text-align: center; font-weight: 700; text-transform: uppercase;
  font-size: calc(16 * var(--pt)); letter-spacing: .04em;
  margin: calc(14 * var(--pt)) 0 calc(4 * var(--pt));
}
.mdoc-subtitle { text-align: center; font-style: italic; font-size: calc(13 * var(--pt)); margin: 0; }
.mdoc-status {
  text-align: center; font-style: italic; font-size: calc(11 * var(--pt));
  margin: calc(2 * var(--pt)) 0 calc(16 * var(--pt));
}
.mdoc-part {
  font-size: calc(13 * var(--pt)); font-weight: 700; text-transform: uppercase;
  margin: calc(14 * var(--pt)) 0 calc(6 * var(--pt));
}
.mdoc-part-quiet { text-transform: none; font-size: calc(12 * var(--pt)); }
.mdoc-sub {
  display: block; font-size: calc(13 * var(--pt)); font-weight: 700; font-style: italic;
  margin: calc(10 * var(--pt)) 0 calc(4 * var(--pt));
}

/* The citation keeps its own colour against the blanket black above — it is an apparatus mark,
   not body text, and it has to read as one. */
.mdoc-cite { font-size: calc(11 * var(--pt)); font-style: italic; color: #444444 !important; white-space: nowrap; }
.mdoc-cite-button { background: none; border: 0; padding: 0; cursor: pointer; font: inherit; text-decoration: underline dotted; }
.mdoc-cite-button:hover { color: #000000 !important; }
.mdoc-owner { font-style: italic; }
.mdoc-ref { font-variant-numeric: tabular-nums; }
.mdoc-translated { margin: 0 0 calc(6 * var(--pt)) calc(6 * var(--mm)); font-style: italic; font-size: calc(11 * var(--pt)); color: #333333 !important; }
.mdoc-lang { font-style: normal; font-size: calc(9 * var(--pt)); }

.mdoc-table { width: 100%; border-collapse: collapse; margin: calc(6 * var(--pt)) 0 calc(10 * var(--pt)); font-size: calc(12 * var(--pt)); }
.mdoc-table th, .mdoc-table td { border: 1px solid #000000; padding: calc(4 * var(--pt)) calc(6 * var(--pt)); vertical-align: top; text-align: left; }
.mdoc-table th { font-weight: 700; }
.mdoc-col-no { width: 8%; }
.mdoc-col-owner { width: 24%; }
.mdoc-col-ref { width: 16%; }

.mdoc-sig { display: grid; grid-template-columns: 1fr 1fr; margin-top: calc(20 * var(--pt)); text-align: center; }
.mdoc-sig b { display: block; text-transform: uppercase; }
.mdoc-sig i { display: block; font-size: calc(11 * var(--pt)); }
/* Real space for a pen. A signature block with no room to sign in is a picture of one. */
.mdoc-sig-space { height: calc(46 * var(--pt)); }
.mdoc-sig-lines { display: block; text-align: left; }

.mdoc-foot {
  margin-top: calc(22 * var(--pt)); border-top: 1px solid #999999; padding-top: calc(6 * var(--pt));
  font-size: calc(11 * var(--pt)); font-style: italic;
}
.mdoc-foot p { margin: 0 0 calc(3 * var(--pt)); }

/* A field set in the page: the document's own face, transparent, with a dashed rule so it is
   visibly typable. Editing must not move the line it is editing. */
.mdoc-field {
  display: block; width: 100%; resize: none; overflow: hidden;
  background: transparent; color: #000000;
  font: inherit; line-height: inherit;
  border: 0; border-bottom: 1px dashed #7a7a7a;
  padding: 0; margin: 0;
}
.mdoc-field:focus { outline: 2px solid #5e6ad2; outline-offset: 2px; }
.mdoc-field::placeholder { color: #8a8a8a; font-style: italic; }
/* A line being edited keeps its number and its citation ON the line. Without this the field's
   own block box pushes them above and below it, and the document appears to reflow the moment
   editing starts — which is the one thing editing in place was meant to avoid. */
.mdoc-body:has(> .mdoc-field) { display: flex; align-items: baseline; gap: calc(2 * var(--pt)); }
.mdoc-body:has(> .mdoc-field) > .mdoc-field { flex: 1 1 auto; }

.mdoc-guides { position: absolute; inset: 0; pointer-events: none; }
.mdoc-guide-box {
  position: absolute;
  top: calc(20 * var(--mm)); bottom: calc(20 * var(--mm));
  left: calc(30 * var(--mm)); right: calc(20 * var(--mm));
  border: 1px dashed #5e6ad2;
}
.mdoc-guide {
  position: absolute; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px; color: #5e6ad2 !important; background: rgba(255,255,255,.9); padding: 0 3px;
}
.mdoc-guide-l { left: 2px; top: 50%; transform: translateY(-50%); }
.mdoc-guide-r { right: 2px; top: 50%; transform: translateY(-50%); }
.mdoc-guide-t { top: 3px; left: 50%; transform: translateX(-50%); }
.mdoc-guide-b { bottom: 3px; left: 50%; transform: translateX(-50%); }

/* ── global-en: same page frame, a different set of rules over it ── */
.mdoc-page.mdoc-iso {
  padding: calc(25.4 * var(--mm));
  font-family: Aptos, Calibri, Arial, Helvetica, sans-serif;
  font-size: calc(11 * var(--pt));
  line-height: 1.45;
}
.mdoc-iso .mdoc-guide-box {
  top: calc(25.4 * var(--mm)); bottom: calc(25.4 * var(--mm));
  left: calc(25.4 * var(--mm)); right: calc(25.4 * var(--mm));
}
.mdoc-iso .mdoc-title {
  text-transform: none; font-size: calc(18 * var(--pt)); letter-spacing: -.01em;
  text-align: left; margin: calc(4 * var(--pt)) 0 calc(2 * var(--pt));
}
.mdoc-iso .mdoc-subtitle { text-align: left; font-style: normal; font-size: calc(12 * var(--pt)); color: #444444 !important; }
.mdoc-iso .mdoc-status { text-align: left; margin: calc(2 * var(--pt)) 0 calc(14 * var(--pt)); }
.mdoc-iso .mdoc-part { text-transform: none; font-size: calc(12 * var(--pt)); margin: calc(13 * var(--pt)) 0 calc(4 * var(--pt)); }
.mdoc-iso .mdoc-cl { display: grid; grid-template-columns: calc(13 * var(--mm)) 1fr; gap: calc(2 * var(--mm)); margin-bottom: calc(4 * var(--pt)); }
.mdoc-iso .mdoc-n { font-variant-numeric: tabular-nums; }
.mdoc-iso .mdoc-cl p { margin: 0 0 calc(3 * var(--pt)); }
.mdoc-iso .mdoc-ctrl { margin-bottom: calc(12 * var(--pt)); font-size: calc(9.5 * var(--pt)); }
.mdoc-iso .mdoc-ctrl th, .mdoc-iso .mdoc-ctrl td { border: 1px solid #bbbbbb; padding: calc(3 * var(--pt)) calc(5 * var(--pt)); }
.mdoc-iso .mdoc-ctrl th { background: #f0f0f0; width: 26%; font-weight: 700; }
.mdoc-iso .mdoc-table { font-size: calc(10 * var(--pt)); }
.mdoc-iso .mdoc-table th, .mdoc-iso .mdoc-table td { border: 1px solid #999999; }
.mdoc-iso .mdoc-actions thead th { background: #f0f0f0; }
.mdoc-iso .mdoc-sig { margin-top: calc(16 * var(--pt)); }
.mdoc-iso .mdoc-sig b { text-transform: none; }
.mdoc-label {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: calc(8 * var(--pt));
  letter-spacing: .08em; text-transform: uppercase; color: #666666 !important;
  margin: 0 0 calc(3 * var(--pt));
}

/* A narrow viewport shrinks the page rather than cropping it: the proportions are the content. */
@media (max-width: 760px) {
  .mdoc-wrap { --mm: 1.9px; --pt: .6706px; padding: 12px 6px 18px; }
}

@media print {
  /*
    Ctrl+P on this tab prints the minutes and nothing else.

    The rules reach outside this component deliberately. The panel can hide its own toolbar, but
    the app shell around it — sidebar, tabs, the room page's header — belongs to other components
    on another branch, and a minutes document that prints with a navigation sidebar down the side
    of it is not a document. So everything is hidden and the page is made visible again, which is
    scoped in time rather than in space: these rules exist only while this panel is mounted.
  */
  body * { visibility: hidden !important; }
  .mdoc-print-root, .mdoc-print-root * { visibility: visible !important; }
  .mdoc-print-root { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; }

  /* The payoff of writing every dimension in --mm and --pt: redefining the two units to real
     physical ones prints the same markup at true A4 size, with no second layout. */
  .mdoc-wrap { --mm: 1mm; --pt: 1pt; display: block !important; padding: 0 !important; overflow: visible !important; }
  .mdoc-page { box-shadow: none !important; margin: 0 !important; min-height: 0 !important; }
  .mdoc-guides { display: none !important; }
  .mdoc-cite-button { text-decoration: none !important; }
  .mdoc-field { border-bottom: 0 !important; }
  /* Keep a part and its first lines together, and never break a signature block across pages. */
  .mdoc-part { break-after: avoid; }
  .mdoc-sig, .mdoc-table tr { break-inside: avoid; }
  @page { size: A4; margin: 0; }
}
`}</style>
  );
}

/**
 * Send the page to the printer.
 *
 * A function rather than a bare `window.print` at the call site so the server render never touches
 * `window`: the button exists in both renders — which is what keeps hydration quiet — and only the
 * click reaches the browser API.
 */
export function printDocument() {
  if (typeof window !== "undefined") window.print();
}
