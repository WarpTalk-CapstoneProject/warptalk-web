/**
 * How one stored minutes document becomes a numbered record, in either template.
 *
 * The three things pinned here are the ones where being wrong is invisible on screen and expensive
 * on paper: a template chosen for the wrong reader, a clause numbered so that "per clause 4.2"
 * points at something else, and a policy row printed for a fact the product does not hold. The
 * last of those is the reason this file exists at all — the rule is that an unconfigured field
 * prints NOTHING, and a rule stated only in a comment is one that quietly acquires a default.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  closingSentence,
  externalGuestNotice,
  formatDocumentDate,
  formatDocumentTime,
  isMinutesTemplate,
  motionLines,
  numberClauses,
  planMinutesDocument,
  printablePolicyRows,
  provenanceLines,
  recordingNotice,
  referenceForAction,
  resolveMinutesTemplate,
  romanNumeral,
  translationLanguagesOf,
} from "../minutes-document.ts";
import type {
  MeetingMinutesContent,
  MinutesAttendance,
  MinutesSection,
} from "../../../types/meetingMinutes.ts";

const titleOf = (key: string) => key;

const emptyAttendance = (): MinutesAttendance => ({
  present: [],
  absent: [],
  invitedCount: 0,
  presentCount: 0,
});

/* ── Template selection ── */

test("a stored workspace preference wins over everything derived", () => {
  assert.equal(
    resolveMinutesTemplate({ stored: "global-en", primaryLanguage: "vi" }),
    "global-en",
  );
});

test("a stored value this build does not recognise is ignored, not obeyed", () => {
  assert.equal(
    resolveMinutesTemplate({ stored: "nd-30-v2", primaryLanguage: "vi" }),
    "vn-nd30",
  );
});

test("the meeting's own language chooses the layout when nothing is stored", () => {
  assert.equal(resolveMinutesTemplate({ primaryLanguage: "vi" }), "vn-nd30");
  assert.equal(resolveMinutesTemplate({ primaryLanguage: "vi-VN" }), "vn-nd30");
  assert.equal(resolveMinutesTemplate({ primaryLanguage: "VI_vn" }), "vn-nd30");
  assert.equal(resolveMinutesTemplate({ primaryLanguage: "en" }), "global-en");
});

test("the workspace default is only consulted when the meeting does not say", () => {
  assert.equal(
    resolveMinutesTemplate({ primaryLanguage: "en", workspaceDefaultLanguage: "vi" }),
    "global-en",
  );
  assert.equal(
    resolveMinutesTemplate({ primaryLanguage: null, workspaceDefaultLanguage: "vi" }),
    "vn-nd30",
  );
});

test("knowing nothing falls to the layout that is still readable to everyone", () => {
  assert.equal(resolveMinutesTemplate({}), "global-en");
  assert.ok(isMinutesTemplate("vn-nd30"));
  assert.ok(!isMinutesTemplate("vn"));
});

/* ── Routing and numbering ── */

const paragraph = (key: string, text: string): MinutesSection => ({ key, kind: "paragraph", text });
const items = (key: string, entries: [string, number | null][]): MinutesSection => ({
  key,
  kind: "items",
  items: entries.map(([text, atMs]) => ({ text, atMs })),
});

test("sections are routed to parts by key, and anything unknown stays in the narrative", () => {
  const plan = planMinutesDocument([
    paragraph("summary", "We met."),
    items("decisions", [["Ship on Friday", 1000]]),
    items("actionItems", [["Write the migration", 2000]]),
    items("blockers", [["The staging cluster is down", 3000]]),
  ]);

  assert.deepEqual(plan.proceedings.map((entry) => entry.section.key), ["summary", "blockers"]);
  assert.deepEqual(plan.decisions.map((entry) => entry.section.key), ["decisions"]);
  assert.deepEqual(plan.actions.map((entry) => entry.section.key), ["actionItems"]);
});

test("routing carries the STORED index, not the reading order", () => {
  const plan = planMinutesDocument([
    items("decisions", [["a", null]]),
    paragraph("summary", "b"),
  ]);

  // The narrative prints first and is stored second. An edit to it must still land on sections[1].
  assert.equal(plan.proceedings[0].index, 1);
  assert.equal(plan.decisions[0].index, 0);
});

test("a part built from two sections is one continuous numbered run", () => {
  const plan = planMinutesDocument([
    items("problems", [["Storage diverges", 1000], ["The page does not refresh", 2000]]),
    items("blockers", [["Staging is down", 3000]]),
  ]);

  const clauses = numberClauses(4, plan.proceedings, titleOf);

  assert.deepEqual(clauses.map((clause) => clause.clause), ["4.1", "4.2", "4.3"]);
  assert.deepEqual(clauses.map((clause) => clause.ordinal), [1, 2, 3]);
  // The heading appears once per section, on the first clause that section contributed.
  assert.deepEqual(clauses.map((clause) => clause.heading), ["problems", null, "blockers"]);
});

test("a clause remembers exactly which stored slot it came from", () => {
  const plan = planMinutesDocument([paragraph("summary", "One paragraph.")]);
  const [clause] = numberClauses(3, plan.proceedings, titleOf);

  assert.equal(clause.sectionIndex, 0);
  // null, not 0: a paragraph section holds its text on itself, and writing to items[0] would
  // invent an item nobody wrote.
  assert.equal(clause.itemIndex, null);
  assert.equal(clause.text, "One paragraph.");
});

test("an empty paragraph section still produces a clause, so editing can reach it", () => {
  const plan = planMinutesDocument([{ key: "summary", kind: "paragraph", text: null }]);
  assert.equal(numberClauses(2, plan.proceedings, titleOf).length, 1);
});

test("roman numerals are converted, not looked up", () => {
  assert.equal(romanNumeral(1), "I");
  assert.equal(romanNumeral(4), "IV");
  assert.equal(romanNumeral(9), "IX");
  assert.equal(romanNumeral(14), "XIV");
  assert.equal(romanNumeral(0), "");
});

/* ── Action references ── */

test("an action refers back only to the clause citing the same moment", () => {
  const plan = planMinutesDocument([items("problems", [["A", 1000], ["B", 2000]])]);
  const clauses = numberClauses(4, plan.proceedings, titleOf);

  assert.equal(referenceForAction({ text: "Fix A", atMs: 1000 }, clauses), "4.1");
  assert.equal(referenceForAction({ text: "Fix B", atMs: 2000 }, clauses), "4.2");
});

test("no citation is no reference — position is never evidence", () => {
  const plan = planMinutesDocument([items("problems", [["A", 1000]])]);
  const clauses = numberClauses(4, plan.proceedings, titleOf);

  assert.equal(referenceForAction({ text: "Fix A", atMs: null }, clauses), null);
  assert.equal(referenceForAction({ text: "Fix A", atMs: 9999 }, clauses), null);
});

test("a moment cited by two clauses identifies neither", () => {
  const plan = planMinutesDocument([items("problems", [["A", 1000], ["A again", 1000]])]);
  const clauses = numberClauses(4, plan.proceedings, titleOf);

  assert.equal(referenceForAction({ text: "Fix A", atMs: 1000 }, clauses), null);
});

/* ── Motions ── */

test("a motion stored before the new fields existed still prints its counts", () => {
  const lines = motionLines({ topic: "Adopt the reading mode", forCount: 4, againstCount: 0, abstainCount: 1 });

  assert.equal(lines.attribution, null);
  assert.equal(lines.outcome, "4 for, 0 against, 1 abstaining");
});

test("the chair's declared outcome leads, and the counts are its evidence", () => {
  const lines = motionLines({
    topic: "Adopt the reading mode",
    forCount: 4,
    againstCount: 0,
    abstainCount: 1,
    movedBy: "Thu Ha",
    secondedBy: "Minh Khoa",
    outcome: "Carried",
  });

  assert.equal(lines.attribution, "Moved by Thu Ha · Seconded by Minh Khoa");
  assert.equal(lines.outcome, "Carried — 4 for, 0 against, 1 abstaining");
});

test("a motion with a proposer but no seconder names only the proposer", () => {
  const lines = motionLines({
    topic: "Adjourn",
    forCount: 3,
    againstCount: 3,
    abstainCount: 0,
    movedBy: "Thu Ha",
  });

  assert.equal(lines.attribution, "Moved by Thu Ha");
  // A tie is not declared lost here: the majority a motion needed belongs to the room's own rules
  // of order, and this client does not hold them.
  assert.equal(lines.outcome, "3 for, 3 against, 0 abstaining");
});

/* ── Dates ── */

test("the two templates write the same instant differently, and both in English", () => {
  const at = "2026-05-28T07:00:00Z";

  assert.equal(formatDocumentDate(at, "vn-nd30", "UTC"), "28 May 2026");
  assert.equal(formatDocumentDate(at, "global-en", "UTC"), "2026-05-28");
  assert.equal(formatDocumentTime(at, "vn-nd30", "UTC"), "07:00");
  assert.equal(formatDocumentTime(at, "global-en", "UTC"), "07:00 (UTC+00:00)");
});

test("the document states the wall clock where the meeting was, not where the reader is", () => {
  const at = "2026-05-28T07:00:00Z";
  assert.equal(formatDocumentTime(at, "global-en", "Asia/Ho_Chi_Minh"), "14:00 (UTC+07:00)");
  assert.equal(formatDocumentDate(at, "vn-nd30", "Asia/Ho_Chi_Minh"), "28 May 2026");
});

test("an unusable date prints nothing rather than a wrong one", () => {
  assert.equal(formatDocumentDate(null, "vn-nd30", "UTC"), null);
  assert.equal(formatDocumentDate("not a date", "global-en", "UTC"), null);
});

test("a meeting with no recorded closing time still closes", () => {
  const content: MeetingMinutesContent = {
    attendance: emptyAttendance(),
    sections: [],
    votes: [],
    closedAt: null,
  };
  assert.equal(
    closingSentence(content, "global-en", "UTC"),
    "There being no further business, the meeting closed.",
  );
});

/* ── The policy block: what may be printed ── */

test("a document nobody configured prints no policy rows at all", () => {
  assert.deepEqual(printablePolicyRows({}), []);
});

test("classification prints only when the stored document carries one", () => {
  assert.equal(printablePolicyRows({ classification: "  " }).length, 0);
  assert.deepEqual(printablePolicyRows({ classification: "Confidential" }), [
    { key: "classification", label: "Classification", value: "Confidential" },
  ]);
});

test("circulation distinguishes not knowing from knowing it is private", () => {
  // null is the room's settings not having loaded. Printing "host only" for it would state an
  // access decision nobody made.
  assert.equal(printablePolicyRows({ recordShared: null }).length, 0);
  assert.equal(
    printablePolicyRows({ recordShared: false })[0].value,
    "The meeting host only",
  );
  assert.equal(
    printablePolicyRows({ recordShared: true })[0].value,
    "Everyone who took part in the meeting",
  );
});

test("retention prints an end date only when there is a real date to count from", () => {
  assert.equal(
    printablePolicyRows({ artifactRetentionDays: 90, retentionFrom: "2026-05-28T07:00:00Z" })[0]
      .value,
    "90 days from the meeting — until 2026-08-26",
  );
  assert.equal(
    printablePolicyRows({ artifactRetentionDays: 90 })[0].value,
    "90 days",
  );
  // A workspace with no retention window configured gets no row, not "0 days".
  assert.equal(printablePolicyRows({ artifactRetentionDays: 0 }).length, 0);
  assert.equal(printablePolicyRows({ artifactRetentionDays: null }).length, 0);
});

test("the language row names the original and drops a translation into its own language", () => {
  assert.equal(
    printablePolicyRows({ primaryLanguage: "vi", translationLanguages: ["en", "vi"] })[0].value,
    "vi (as spoken) · also recorded in en",
  );
  assert.equal(
    printablePolicyRows({ primaryLanguage: "vi", translationLanguages: [] })[0].value,
    "vi (as spoken)",
  );
});

test("the rows come back in document-control order", () => {
  const rows = printablePolicyRows({
    classification: "Internal",
    recordOwner: "Thu Ha",
    recordShared: true,
    artifactRetentionDays: 30,
    retentionFrom: "2026-05-28T00:00:00Z",
    primaryLanguage: "en",
  });

  assert.deepEqual(rows.map((row) => row.key), [
    "classification",
    "owner",
    "circulation",
    "retention",
    "language",
  ]);
});

/* ── Provenance and notices ── */

const noMoment = () => null;

test("provenance always states what the document is, even with nothing else known", () => {
  assert.deepEqual(
    provenanceLines({ minutesNo: "BB-2026/05/28-01", version: 2, statusLabel: "Approved" }, noMoment),
    ["BB-2026/05/28-01 · version 2 · Approved"],
  );
});

test("an unchanged draft says so, because 'unchanged' is itself the finding", () => {
  const lines = provenanceLines(
    {
      minutesNo: "BB-1",
      version: 1,
      statusLabel: "Signed by the secretary",
      draftedByEngine: "WarpTalk AI",
      secretaryName: "Thu Ha",
      secretarySignedAt: "2026-05-28T07:22:00Z",
      editCountVsDraft: 0,
    },
    noMoment,
  );

  assert.equal(lines[1], "Drafted by WarpTalk AI.");
  assert.equal(lines[2], "Signed by Thu Ha; unchanged from the draft.");
});

test("one change is singular, and a name with no signature makes no claim", () => {
  const signed = provenanceLines(
    {
      minutesNo: "BB-1",
      version: 1,
      statusLabel: "Signed",
      secretaryName: "Thu Ha",
      secretarySignedAt: "2026-05-28T07:22:00Z",
      editCountVsDraft: 1,
    },
    noMoment,
  );
  assert.equal(signed[1], "Signed by Thu Ha; 1 change from the draft.");

  const unsigned = provenanceLines(
    { minutesNo: "BB-1", version: 1, statusLabel: "Draft", secretaryName: "Thu Ha" },
    noMoment,
  );
  assert.equal(unsigned.length, 1);
});

test("no recording notice at all until the room says whether it was written down", () => {
  assert.equal(recordingNotice({ transcriptKept: null }), null);
  assert.equal(recordingNotice({}), null);
});

test("an ephemeral meeting says so rather than saying nothing", () => {
  assert.equal(
    recordingNotice({ transcriptKept: false }),
    "This meeting was not written down: no transcript or recording was kept.",
  );
});

test("the retention date reaches the notice only when the workspace configured one", () => {
  assert.match(
    recordingNotice({
      transcriptKept: true,
      artifactRetentionDays: 30,
      retentionFrom: "2026-05-28T00:00:00Z",
    })!,
    /retained until 2026-06-27\.$/,
  );
  assert.equal(
    recordingNotice({ transcriptKept: true }),
    "This meeting was transcribed, and these minutes were drafted from that transcript.",
  );
});

test("guests from outside the workspace are named as a count, or not at all", () => {
  const roll = (external: boolean[]): MinutesAttendance => ({
    ...emptyAttendance(),
    present: external.map((isExternal, index) => ({
      participantId: `p${index}`,
      name: `P${index}`,
      isExternal,
    })),
  });

  assert.equal(externalGuestNotice(roll([false, false])), null);
  assert.match(externalGuestNotice(roll([true, false]))!, /^One participant/);
  assert.match(externalGuestNotice(roll([true, true]))!, /^2 participants/);
});

test("translation languages come back in a stable order", () => {
  const content: MeetingMinutesContent = {
    attendance: emptyAttendance(),
    sections: [],
    votes: [],
    translations: { vi: [], en: [] },
  };
  assert.deepEqual(translationLanguagesOf(content), ["en", "vi"]);
  assert.deepEqual(
    translationLanguagesOf({ attendance: emptyAttendance(), sections: [], votes: [] }),
    [],
  );
});
