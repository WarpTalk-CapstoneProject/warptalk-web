#!/usr/bin/env node
/**
 * Option C — the transcript on one side, what it amounts to on the other.
 *
 * WHY THIS EXISTS
 *   Every rule below is a NUMBER, and a number in a class list is the easiest thing in this
 *   codebase to lose. Nothing breaks when a measure drifts from `66ch` to `w-full`: the page still
 *   renders, the tests still pass, and the transcript is simply back to 100-character lines a few
 *   releases later. That is exactly how the layout this replaced got there — a reading column is
 *   not a feature that fails loudly, it is one that degrades quietly until somebody notices they
 *   have stopped reading meetings.
 *
 *   The spec these come from is a UX study, and the study's own warning was that the numbers have
 *   to be settled BEFORE the code or the reading mode drifts back into a full-bleed layout after a
 *   few edits. This is that settlement, written where an edit has to walk past it.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const rail = read("src/components/rooms/meeting-reading-rail.tsx");
const panel = read("src/components/rooms/meeting-transcript-panel.tsx");
const sync = read("src/components/rooms/transcript-reading-sync.tsx");
const player = read("src/components/rooms/meeting-record-panels.tsx");
const roomDetail = read("src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx");
const logic = read("src/lib/transcript/document-reading.ts");

// ── The measure: characters, never a percentage ─────────────────────────────

// A percentage column grows with the window, and a 100-character line is unreadable however wide
// the screen holding it is. Capping in `ch` turns the extra width into margin instead.
assert.match(
  panel,
  /max-w-\[var\(--reading-measure,66ch\)\]/,
  "A spoken line must cap at 66ch, and must take that width from the one variable that decides "
    + "it, so the rail can narrow it without the row knowing anything about the rail.",
);
// The default is the FALLBACK and lives nowhere else in the panel. Custom properties inherit, and
// a declaration on a descendant beats an ancestor's whatever media query is on it — so a
// `--reading-measure` set inside the column would silently make the 52ch below unreachable. This
// went in as a bug once already.
assert.doesNotMatch(
  panel,
  /\[--reading-measure:/,
  "The reading column must not declare the measure itself — doing so shadows the rail's and the "
    + "comparison measure never applies.",
);
assert.match(
  rail,
  /"\[--reading-measure:66ch\]"/,
  "The measure is declared on the ancestor of both regions, because it is a fact about the pair "
    + "rather than about either column.",
);
// This assertion is the reverse of the one it replaces, and the reversal is the point.
//
// It used to require `xl:[--reading-measure:52ch]` whenever the pip was open, on the theory that
// somebody glancing between a picture and the text reads in shorter bursts. The flaw was that the
// pip opens BY DEFAULT: the narrowest measure became the default state, and 52ch of text sitting
// in a 940px column read as a broken layout rather than as a considered one. Reading width must
// not move because a video thumbnail is on screen. If a real compare mode is built later, that
// mode can own the change — and this assertion should be revisited then, not deleted quietly.
assert.doesNotMatch(
  rail,
  /--reading-measure:52ch/,
  "The measure must not narrow just because the recording pip is open. 66ch is the measure in "
    + "both states.",
);

// ── Vertical breathing room, and the gutter ─────────────────────────────────

// Vietnamese stacks a tone mark above and a vowel mark below the same letter, so a line occupies
// more vertical space than the font metrics claim. At the 1.5 the rest of the panel uses, the
// marks of one line touch the letters of the next.
assert.match(
  panel,
  /leading-\[1\.75\]/,
  "The reading column's line height must be 1.75.",
);
assert.match(
  panel,
  /text-\[14\.5px\]/,
  "Reading text must not drop below 14.5px — the spec's floor is 14px and this is the size that "
    + "was measured, not a size that happened.",
);
assert.match(
  panel,
  /grid-cols-\[56px_minmax\(0,1fr\)\]/,
  "The timestamp belongs in its own 56px gutter, not on the same line as the words.",
);
assert.match(
  panel,
  /font-mono text-\[10\.5px\] tabular-nums/,
  "The gutter must be mono and tabular, or the times do not form an edge the eye can run down.",
);

// ── The rail's width is a decision, and the number moved once ───────────────

// A summary is ~15 lines read in 30 seconds; the transcript beside it is ~600 lines read in ten
// minutes. `1fr 1fr` divides the screen by nominal importance. This divides it by reading volume.
//
// It started at 380/320 and is 420/360 now. The rail was widened once the summary stopped being a
// filtered extract of itself: it carries every point of the document, not only the ones with a
// citation, so it has more to hold than the number was chosen for. The principle is unchanged and
// is what this assertion is really pinning — a fixed rail sized to its own content, never a
// fraction of the viewport and never a half-and-half split.
assert.match(
  rail,
  /lg:grid-cols-\[minmax\(0,1fr\)_360px\] xl:grid-cols-\[minmax\(0,1fr\)_420px\]/,
  "Two regions: 420px of rail at ≥1280px, 360px between 1024 and 1280. Never a half-and-half "
    + "split, and never a third column.",
);
// <1024px stacks, and the summary goes ON TOP: on a small screen people read the summary and then
// decide whether the transcript is worth their next ten minutes.
assert.match(
  rail,
  /order-1 flex min-w-0 flex-col/,
  "Stacked, the rail must come first — the transcript below it is the thing being decided about.",
);
assert.match(
  rail,
  /className="order-2 min-w-0 lg:order-none"/,
  "The transcript takes second place only while stacked, and returns to source order at lg.",
);

// ── The video stops being a column ──────────────────────────────────────────

// At 1440px, 296 (video) + 620 (transcript at 66ch) + 380 (summary) is 1296px before a single
// gutter. One of the three has to stop being a column, and the video is the only one that can
// shrink without losing a function — the other two are text.
assert.match(
  player,
  /variant\?: "section" \| "pip"/,
  "The recording must be able to become a pip rather than being a second player component.",
);
assert.match(
  player,
  /h-\[56px\] w-full bg-black xl:aspect-video xl:h-auto/,
  "Between 1024 and 1280 the pip collapses to the height of its own transport controls — one "
    + "element at both sizes, because a second <video> is a second fetch and a second consent.",
);
assert.doesNotMatch(
  roomDetail,
  /activeTab === "transcript" \|\| activeTab === "summary" \? \(\s*<MeetingRecordingPlayer/,
  "The transcript tab must not render the full-width block player above the reading column — "
    + "that 16:9 frame is the single biggest reason the transcript was read a screenful at a time.",
);

// ── Both directions of the sync, and the one that gets forgotten ────────────

// `atMs` rather than `claim.atMs`: the interactive branch narrows the nullable field to a local
// first, because a point with no moment is rendered as text and never reaches this button at all.
assert.match(
  rail,
  /onMouseEnter=\{\(\) => onMark\(atMs\)\}[\s\S]{0,200}?onFocus=\{\(\) => onMark\(atMs\)\}/,
  "Pointing at a claim must mark its paragraph for a keyboard reader too, not only for a mouse.",
);
assert.match(
  rail,
  /onClick=\{\(\) => onJumpToMoment\(atMs\)\}/,
  "Clicking a claim must take the reader to the sentence it came from.",
);
// The direction that earns the layout. Without it, two columns of text side by side are just two
// columns of text side by side — this is what teaches a reader that the summary has a source.
assert.match(
  panel,
  /readingAnchorAt\(/,
  "Scrolling the transcript must report which block is being read, so the claim covering it lights "
    + "up on its own.",
);
assert.match(
  rail,
  /groupCitationsByAnchor\(/,
  "Which claims cover the block being read must go through the shared rule, not a millisecond "
    + "comparison of the rail's own — a claim anchored to the pause between two turns has to land.",
);

// This rule was inverted, and the note is the record of why.
//
// It used to require that a claim with no cited moment be dropped from the rail: a column whose
// argument is that assertions have sources should not open with an assertion that has none. The
// principle is right; applying it by DELETING the claim was not. It left the rail showing a
// filtered, reordered extract while presenting itself as the summary, and the only way to read the
// rest was a button to another tab. Readers could not tell a short summary from a censored one.
//
// The honest rendering is to show every point and let the ones with no moment look like what they
// are: no jump, no highlight, and the words "no moment recorded" where the timestamp would be.
assert.doesNotMatch(
  rail,
  /if \(item\.atMs === null\) return;/,
  "Every summary point must render in the rail. A point with no moment loses its jump, not its "
    + "place in the document.",
);
assert.match(
  rail,
  /no moment recorded/,
  "A point with no moment must say so in place of a timestamp, so it cannot be mistaken for one "
    + "the transcript vouches for.",
);
assert.match(
  rail,
  /uncitedCount/,
  "How much of the summary the transcript cannot vouch for must be stated, never left implicit.",
);

// ── The keyboard, and the paper ─────────────────────────────────────────────

assert.match(
  logic,
  /export function readingShortcut\(/,
  "J / K / Space / `/` must be one decision in one pure function, not four ifs in a handler.",
);
assert.match(
  sync,
  /window\.addEventListener\("keydown"/,
  "The keymap listens on the window: a reader who scrolled with the wheel has focus on nothing, "
    + "and making them click the transcript first would make the shortcut undiscoverable.",
);
assert.match(
  panel,
  /print:max-h-none print:overflow-visible/,
  "A page of paper has no viewport to bound and no scrollbar to scroll — the frame that makes this "
    + "readable on screen is exactly what has to go on paper.",
);
assert.match(
  panel,
  /print:break-inside-avoid/,
  "A speaker turn split across a page break loses the name that says whose words the second half is.",
);
assert.match(
  rail,
  /lg:order-none print:hidden/,
  "On paper the transcript is the document; a printed rail interleaved with it is neither.",
);

// ── Inner scrollers still chain, as WT-330(8) requires of this whole route ──
//
// Named as a pair of utilities rather than described, because the failure is invisible: a
// contained scroller simply stops the page at the end of the rail, and the reader thinks the
// page has frozen.
for (const [name, source] of [
  ["the reading rail", rail],
  ["the transcript panel", panel],
]) {
  assert.doesNotMatch(
    source,
    /overscroll-(contain|none)/,
    `${name} must let its inner scroll chain to the page — containment is the trap WT-330(8) removed.`,
  );
}

console.log("Reading rail contract (Option C): PASS");
