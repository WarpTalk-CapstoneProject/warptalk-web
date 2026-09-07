/**
 * The minutes as a DOCUMENT: how one `MeetingMinutesContent` is laid out as a numbered record.
 *
 * WHY THIS IS A SEPARATE MODULE
 *   The panel used to render the minutes as a stack of labelled key/value rows — an admin form.
 *   A reader could not tell it was a minutes record at all: no number on the face of it, no roll,
 *   no numbered decisions, no signatures. Turning it into something that reads as a document is
 *   mostly a question of ORDER and NUMBERING, and both of those are pure functions of the stored
 *   content. Keeping them here means they are testable without a browser — the node runner strips
 *   types but cannot parse JSX, so nothing decidable may live in the .tsx that renders it.
 *
 * TWO TEMPLATES, ONE CONTENT
 *   `vn-nd30` and `global-en` are two presentation layers over the SAME content. Neither replaces
 *   the other: a Vietnamese company sending minutes to a domestic partner needs the layout that
 *   country reads as correctly drawn up; the same company sending to an overseas client needs the
 *   other. So everything in here that differs between them takes the template id as an argument
 *   rather than being decided once at module scope.
 *
 * WHAT THIS MODULE REFUSES TO DO
 *   It never invents a value. A classification nobody set, a retention window no workspace
 *   configured, a circulation scope the client has not actually read — each of those produces NO
 *   ROW, never a plausible default. This mirrors the rule the .docx writer already follows, where
 *   a date nobody recorded prints as an ellipsis rather than as today's date. On a document people
 *   sign, a confident guess is worse than a visible blank.
 *
 * Dependency-free and relative-import-only, in the style of room-history-mapping.ts, so
 * `node --experimental-strip-types` can exercise it directly.
 */

import type {
  MeetingMinutesContent,
  MinutesAttendance,
  MinutesItem,
  MinutesSection,
  MinutesVote,
} from "../../types/meetingMinutes.ts";

/* ─────────────────────────── Templates ─────────────────────────── */

export type MinutesTemplateId = "vn-nd30" | "global-en";

/**
 * The two layouts, for the switcher.
 *
 * `note` is the one-line difference a reader needs in order to choose, not a description of the
 * standard: somebody picking a template is asking "which of these will my recipient recognise".
 */
export const MINUTES_TEMPLATES: {
  id: MinutesTemplateId;
  label: string;
  note: string;
}[] = [
  {
    id: "vn-nd30",
    label: "Vietnamese layout",
    note: "Roman-numeral parts, wide binding margin, serif body, two signature columns.",
  },
  {
    id: "global-en",
    label: "International layout",
    note: "Decimal clause numbering, ISO dates, a document-control table, signature lines.",
  },
];

export function isMinutesTemplate(value: unknown): value is MinutesTemplateId {
  return value === "vn-nd30" || value === "global-en";
}

/**
 * Which layout to open the document in.
 *
 * WHY THE DEFAULT IS THE MEETING'S OWN LANGUAGE
 *   No workspace setting stores this preference yet — `stored` is here for the day one does, and
 *   until then it is always absent. Something still has to choose, and the best evidence available
 *   about who will read the record is the language the meeting was held in: a meeting conducted in
 *   Vietnamese is one whose minutes a Vietnamese reader will file, and the wide binding margin and
 *   Roman-numeral parts are exactly what tells that reader the document was drawn up properly.
 *
 *   Everything else falls to `global-en`, and deliberately in that direction rather than the other:
 *   decimal clause numbering and ISO dates are legible to a Vietnamese reader too, whereas a page
 *   laid out to the Vietnamese convention reads as a foreign form everywhere else. When the guess
 *   is going to be wrong, it should be wrong in the direction that is still readable — and the
 *   reader can switch templates in one click regardless.
 */
export function resolveMinutesTemplate(input: {
  /** A workspace-level preference, once one exists. Anything unrecognised is ignored, not obeyed. */
  stored?: string | null;
  /** `MeetingMinutesContent.primaryLanguage` — the language the meeting was actually held in. */
  primaryLanguage?: string | null;
  /** The workspace's default language, used only when the meeting itself does not say. */
  workspaceDefaultLanguage?: string | null;
}): MinutesTemplateId {
  if (isMinutesTemplate(input.stored)) return input.stored;

  const language = (input.primaryLanguage || input.workspaceDefaultLanguage || "")
    .trim()
    .toLowerCase();
  // Prefix, not equality: the wire carries "vi", "vi-VN" and "vi_VN" depending on who wrote it.
  return language === "vi" || language.startsWith("vi-") || language.startsWith("vi_")
    ? "vn-nd30"
    : "global-en";
}

/* ─────────────────────────── Section routing ─────────────────────────── */

/**
 * A section together with WHERE IT LIVES IN THE STORED ARRAY.
 *
 * The index is the whole point. The document reorders sections into parts for reading, but every
 * edit has to be written back to `content.sections[index]` — laying the document out by copying
 * the sections into new arrays and then saving those arrays is how a redesign silently drops a
 * secretary's correction into the wrong section.
 */
export interface PlannedSection {
  section: MinutesSection;
  index: number;
}

export interface MinutesDocumentPlan {
  /** Everything discussed: part II (vn-nd30) / part 4 (global-en). */
  proceedings: PlannedSection[];
  /** What the meeting settled: part III / part 5. */
  decisions: PlannedSection[];
  /** Who does what: part IV / part 6, printed as a table in both. */
  actions: PlannedSection[];
}

/** The summary template keys that are not narrative — see meeting-summary.ts for the full set. */
const DECISION_KEYS = new Set(["decisions"]);
const ACTION_KEYS = new Set(["actionItems"]);

/**
 * Sort the stored sections into the document's parts, keeping stored order inside each part.
 *
 * Routing is by KEY and nothing else. The summary templates differ per meeting type — a standup
 * has progress/plans/blockers, an interview has background/strengths/concerns — so the narrative
 * part cannot be an allowlist without a new template silently vanishing from the record. Anything
 * not recognised as a decision or an action is therefore proceedings, which fails towards printing
 * a section in the wrong part rather than not printing it at all.
 */
export function planMinutesDocument(
  sections: MinutesSection[] | null | undefined,
): MinutesDocumentPlan {
  const plan: MinutesDocumentPlan = { proceedings: [], decisions: [], actions: [] };

  (sections ?? []).forEach((section, index) => {
    const planned: PlannedSection = { section, index };
    if (DECISION_KEYS.has(section.key)) plan.decisions.push(planned);
    else if (ACTION_KEYS.has(section.key)) plan.actions.push(planned);
    else plan.proceedings.push(planned);
  });

  return plan;
}

/* ─────────────────────────── Numbering ─────────────────────────── */

const ROMAN_PAIRS: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/**
 * 1 → "I", 4 → "IV". A real conversion rather than a five-entry lookup table, because the number
 * of parts is a function of how many sections a summary template produced and this document is not
 * the place to discover a sixth one had no numeral.
 */
export function romanNumeral(value: number): string {
  if (!Number.isFinite(value) || value < 1) return "";
  let remaining = Math.floor(value);
  let out = "";
  for (const [amount, numeral] of ROMAN_PAIRS) {
    while (remaining >= amount) {
      out += numeral;
      remaining -= amount;
    }
  }
  return out;
}

/**
 * One numbered line of the document body.
 *
 * Flattened across the sections of a part on purpose: a part built from two sections still has to
 * read as ONE numbered run ("4.1 … 4.5"), because the number is what somebody quotes in an email.
 * `sectionIndex` and `itemIndex` are carried through so an edit to the flattened line still writes
 * back to the exact slot it came from.
 */
export interface MinutesClause {
  /** Decimal form for global-en: "4.2". */
  clause: string;
  /** Position within the part, 1-based. vn-nd30 prints this on its own: "2." */
  ordinal: number;
  /** The section's own title, printed only on the FIRST clause it contributed. */
  heading: string | null;
  sectionIndex: number;
  /** null when the clause IS the section — a paragraph section holds its text on itself. */
  itemIndex: number | null;
  text: string;
  owner: string | null;
  atMs: number | null;
}

/**
 * Number every line of one part, in stored order.
 *
 * `titleOf` is injected rather than imported so this module stays dependency-free; the panel
 * passes `sectionTitle` from meeting-summary.ts, which is the map that already knows these keys.
 */
export function numberClauses(
  part: number,
  planned: PlannedSection[],
  titleOf: (key: string) => string,
): MinutesClause[] {
  const clauses: MinutesClause[] = [];

  for (const { section, index } of planned) {
    let firstOfSection = true;
    const push = (text: string, itemIndex: number | null, owner: string | null, atMs: number | null) => {
      const ordinal = clauses.length + 1;
      clauses.push({
        clause: `${part}.${ordinal}`,
        ordinal,
        heading: firstOfSection ? titleOf(section.key) : null,
        sectionIndex: index,
        itemIndex,
        text,
        owner,
        atMs,
      });
      firstOfSection = false;
    };

    if (section.kind === "paragraph") {
      // An empty paragraph section still gets a clause while editing has to reach it — the
      // secretary cannot type into a line the document declined to print.
      push(section.text ?? "", null, null, null);
      continue;
    }

    (section.items ?? []).forEach((item, itemIndex) => {
      push(item.text, itemIndex, item.owner ?? null, item.atMs ?? null);
    });
  }

  return clauses;
}

/**
 * The clause an action item came out of, for the international template's `Ref` column.
 *
 * Matched on the citation and NEVER on position, the same rule `pairByCitation` applies to
 * bilingual lines and for the same reason: a "Ref" is a claim that this task was created by that
 * clause, and a claim like that guessed from array order is how a signed document ends up
 * attributing work to a discussion that never mentioned it. No citation, no reference.
 */
export function referenceForAction(
  item: MinutesItem,
  clauses: MinutesClause[],
): string | null {
  if (item.atMs == null) return null;
  const matches = clauses.filter((clause) => clause.atMs === item.atMs);
  // Two clauses citing the same moment cannot identify one of themselves either.
  return matches.length === 1 ? matches[0].clause : null;
}

/* ─────────────────────────── Motions ─────────────────────────── */

/**
 * The lines a motion prints, in order, skipping every fact nobody recorded.
 *
 * A motion stored before `movedBy`/`secondedBy`/`outcome` existed still has its counts, and it
 * still has to print — so the proposer line disappears rather than reading "Moved: —", which on a
 * document somebody signs looks like a person's name was removed.
 */
export function motionLines(vote: MinutesVote): {
  attribution: string | null;
  outcome: string;
} {
  const moved = vote.movedBy?.trim();
  const seconded = vote.secondedBy?.trim();

  const parts: string[] = [];
  if (moved) parts.push(`Moved by ${moved}`);
  if (seconded) parts.push(`Seconded by ${seconded}`);

  const tally = `${vote.forCount} for, ${vote.againstCount} against, ${vote.abstainCount} abstaining`;
  const declared = vote.outcome?.trim();

  return {
    attribution: parts.length > 0 ? parts.join(" · ") : null,
    // The declared result leads when there is one, because it is the chair's ruling and the counts
    // are only its evidence. With no declaration the counts stand alone: this client does not
    // decide that more votes for than against means "carried", since the majority a motion needed
    // is a property of the room's rules of order and is not stored anywhere here.
    outcome: declared ? `${declared} — ${tally}` : tally,
  };
}

/* ─────────────────────────── Dates and times ─────────────────────────── */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: string;
  minute: string;
  /** "UTC+07:00", or null when the platform's ICU cannot name the offset. */
  offset: string | null;
}

/**
 * The wall-clock reading of an instant in one time zone.
 *
 * Built from `formatToParts` rather than from the Date's own getters because a minutes document
 * states when a meeting opened THERE, not when it opened on the reader's laptop: a Vietnamese
 * meeting read in Berlin must still say 14:00. The zone comes from the workspace's settings; with
 * none configured this falls back to the reader's own zone, which is why the international
 * template prints the offset next to the time rather than leaving it to be assumed.
 */
function zonedParts(value: string, timeZone?: string | null): ZonedParts | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "longOffset",
    }).formatToParts(date);
  } catch {
    // An unrecognised zone string from settings must not take the whole document down with it.
    parts = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "longOffset",
    }).formatToParts(date);
  }

  const find = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const rawOffset = find("timeZoneName");

  return {
    year: Number(find("year")),
    month: Number(find("month")),
    day: Number(find("day")),
    // "24" is midnight in some ICU builds under hour12:false; a document must not print "24:00".
    hour: find("hour") === "24" ? "00" : find("hour"),
    minute: find("minute"),
    offset: rawOffset ? rawOffset.replace(/^GMT/, "UTC").replace(/^UTC$/, "UTC+00:00") : null,
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * The date, in the form its template's readers expect.
 *
 * This is one of the two places the templates visibly disagree, and it is deliberate: the
 * Vietnamese layout writes the day first in long form, the international one writes ISO 8601 so
 * the date sorts and cannot be read as month-first by an American recipient. The month names are
 * English in BOTH — the layout is Vietnamese, the app's language is not.
 */
export function formatDocumentDate(
  value: string | null | undefined,
  template: MinutesTemplateId,
  timeZone?: string | null,
): string | null {
  if (!value) return null;
  const parts = zonedParts(value, timeZone);
  if (!parts) return null;

  return template === "global-en"
    ? `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
    : `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`;
}

/**
 * The clock time. The international template carries the UTC offset with it, because an ISO
 * document that says "14:00" without saying where is not actually a record of when anything
 * happened; the Vietnamese layout prints the local reading, as that convention does.
 */
export function formatDocumentTime(
  value: string | null | undefined,
  template: MinutesTemplateId,
  timeZone?: string | null,
): string | null {
  if (!value) return null;
  const parts = zonedParts(value, timeZone);
  if (!parts) return null;

  const clock = `${parts.hour}:${parts.minute}`;
  return template === "global-en" && parts.offset ? `${clock} (${parts.offset})` : clock;
}

/** Both, for the lines that state a full moment ("opened at 14:00 on 28 May 2026"). */
export function formatDocumentMoment(
  value: string | null | undefined,
  template: MinutesTemplateId,
  timeZone?: string | null,
): string | null {
  const date = formatDocumentDate(value, template, timeZone);
  const time = formatDocumentTime(value, template, timeZone);
  if (!date) return null;
  return time ? `${time} on ${date}` : date;
}

/** The ISO calendar date `days` after `value`, or null when either input is unusable. */
function addDaysIso(value: string, days: number): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const moved = new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/* ─────────────────────────── Security / policy block ─────────────────────────── */

/**
 * Everything the SYSTEM actually knows about how this record is handled.
 *
 * Every field is nullable and every null means "not known", never "no". The distinction carries
 * the whole weight of this block: `recordShared: null` is the room's settings not having loaded,
 * and printing "Host only" for it would state an access decision nobody made.
 */
export interface MinutesPolicyFacts {
  /** `MeetingMinutesContent.classification`. Nothing derives one — see the type's own comment. */
  classification?: string | null;
  /** The named secretary of record. Absent until somebody signs. */
  recordOwner?: string | null;
  /** The room's `artifactAccess`, already resolved by `isRecordShared`. null = not loaded. */
  recordShared?: boolean | null;
  /** `WorkspaceSettingsDto.artifactRetentionDays`. */
  artifactRetentionDays?: number | null;
  /** The date the retention window runs from — when the meeting closed. */
  retentionFrom?: string | null;
  primaryLanguage?: string | null;
  /** The languages the record was also produced in, from `content.translations`. */
  translationLanguages?: string[] | null;
}

export interface MinutesPolicyRow {
  key: string;
  label: string;
  value: string;
}

/**
 * The document-control rows this document can honestly print, in order.
 *
 * A row absent from this list is a fact the product does not hold. That is the entire contract:
 * callers render exactly what comes back and never fill a gap, so adding a plausible-looking
 * default here would defeat the check rather than pass it.
 */
export function printablePolicyRows(facts: MinutesPolicyFacts): MinutesPolicyRow[] {
  const rows: MinutesPolicyRow[] = [];

  const classification = facts.classification?.trim();
  if (classification) {
    rows.push({ key: "classification", label: "Classification", value: classification });
  }

  const owner = facts.recordOwner?.trim();
  if (owner) {
    rows.push({ key: "owner", label: "Record owner", value: owner });
  }

  if (typeof facts.recordShared === "boolean") {
    rows.push({
      key: "circulation",
      label: "Circulation",
      value: facts.recordShared
        ? "Everyone who took part in the meeting"
        : "The meeting host only",
    });
  }

  const days = facts.artifactRetentionDays;
  if (typeof days === "number" && Number.isFinite(days) && days > 0) {
    const until = facts.retentionFrom ? addDaysIso(facts.retentionFrom, days) : null;
    // The window is a real workspace setting; the end date is only printed when there is a real
    // date to count from, so a meeting with no recorded closing time says how long, not until when.
    rows.push({
      key: "retention",
      label: "Retention",
      value: until ? `${days} days from the meeting — until ${until}` : `${days} days`,
    });
  }

  const primary = facts.primaryLanguage?.trim();
  if (primary) {
    const others = (facts.translationLanguages ?? [])
      .map((language) => language.trim())
      .filter((language) => language && language !== primary);
    rows.push({
      key: "language",
      label: "Language",
      value: others.length > 0
        ? `${primary} (as spoken) · also recorded in ${others.join(", ")}`
        : `${primary} (as spoken)`,
    });
  }

  return rows;
}

export interface MinutesProvenanceFacts {
  minutesNo: string;
  version: number;
  statusLabel: string;
  draftedByEngine?: string | null;
  draftedAt?: string | null;
  secretaryName?: string | null;
  secretarySignedAt?: string | null;
  editCountVsDraft?: number | null;
  chairName?: string | null;
  chairApprovedAt?: string | null;
}

/**
 * The answer to "has this document been changed", gathered into one readable block.
 *
 * Pieces of it were already scattered across the panel's footer and its signature rows. The
 * question a reader is actually asking is a single one — who made this, who checked it, how much
 * did they change — so the lines are produced together and in that order.
 *
 * `formatMoment` is injected because the timestamps have to read the way the rest of the chosen
 * template reads; passing an already-bound formatter keeps this module free of template branching.
 */
export function provenanceLines(
  facts: MinutesProvenanceFacts,
  formatMoment: (value: string | null | undefined) => string | null,
): string[] {
  const lines: string[] = [
    `${facts.minutesNo} · version ${facts.version} · ${facts.statusLabel}`,
  ];

  const engine = facts.draftedByEngine?.trim();
  if (engine) {
    const at = formatMoment(facts.draftedAt);
    lines.push(at ? `Drafted by ${engine} at ${at}.` : `Drafted by ${engine}.`);
  }

  const secretary = facts.secretaryName?.trim();
  if (secretary && facts.secretarySignedAt) {
    const at = formatMoment(facts.secretarySignedAt);
    const edits = facts.editCountVsDraft ?? 0;
    // The edit count is the reader's only evidence that a person read the draft rather than
    // signing it unseen, so it is stated even when it is zero — "unchanged" is itself the finding.
    const changed = edits > 0
      ? `${edits} change${edits === 1 ? "" : "s"} from the draft`
      : "unchanged from the draft";
    lines.push(
      at
        ? `Signed by ${secretary} at ${at}; ${changed}.`
        : `Signed by ${secretary}; ${changed}.`,
    );
  }

  const chair = facts.chairName?.trim();
  if (chair && facts.chairApprovedAt) {
    const at = formatMoment(facts.chairApprovedAt);
    lines.push(at ? `Approved by ${chair} at ${at}.` : `Approved by ${chair}.`);
  }

  return lines;
}

/**
 * The recording-and-transcript notice, or null when the product cannot back one.
 *
 * `transcriptKept` is the room's `saveTranscript` setting: true means the meeting was written
 * down, false means it deliberately was not (WT-587), and null means the room has not loaded — in
 * which case nothing is printed, because "this meeting was recorded" is precisely the kind of
 * sentence that must not appear on a guess.
 *
 * The wording says "any recording" rather than "the recording" on purpose. This client knows the
 * meeting was transcribed; whether a video was also retained is a separate artifact it has not
 * inspected, and the notice must not assert one exists.
 */
export function recordingNotice(input: {
  transcriptKept?: boolean | null;
  artifactRetentionDays?: number | null;
  retentionFrom?: string | null;
}): string | null {
  if (input.transcriptKept == null) return null;

  if (input.transcriptKept === false) {
    return "This meeting was not written down: no transcript or recording was kept.";
  }

  const days = input.artifactRetentionDays;
  const until = typeof days === "number" && Number.isFinite(days) && days > 0 && input.retentionFrom
    ? addDaysIso(input.retentionFrom, days)
    : null;

  return until
    ? `This meeting was transcribed. The transcript and any recording of it are retained until ${until}.`
    : "This meeting was transcribed, and these minutes were drafted from that transcript.";
}

/**
 * A notice that people from outside the organisation were in the room, or null when none were.
 *
 * Printed beside the recording notice because the two answer the same question — who has heard
 * this — and because a guest on the roll is the fact that decides whether a record can circulate.
 */
export function externalGuestNotice(attendance: MinutesAttendance): string | null {
  const guests = attendance.present.filter((person) => person.isExternal);
  if (guests.length === 0) return null;
  return guests.length === 1
    ? "One participant attended as a guest from outside the workspace."
    : `${guests.length} participants attended as guests from outside the workspace.`;
}

/* ─────────────────────────── Assembly ─────────────────────────── */

/** Every language a translation of this document exists in, in a stable order. */
export function translationLanguagesOf(content: MeetingMinutesContent): string[] {
  return Object.keys(content.translations ?? {}).sort();
}

/**
 * The closing sentence, stating when the meeting ended.
 *
 * Falls back to a sentence with no time in it rather than to a made-up one: a meeting whose
 * closing moment was never recorded still closed, and the document still needs its last line.
 */
export function closingSentence(
  content: MeetingMinutesContent,
  template: MinutesTemplateId,
  timeZone?: string | null,
): string {
  const closed = formatDocumentMoment(content.closedAt, template, timeZone);
  return closed
    ? `There being no further business, the meeting closed at ${closed}.`
    : "There being no further business, the meeting closed.";
}
