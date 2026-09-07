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
  "The measure is declared on the ancestor of both regions, because the pip's presence is what "
    + "decides it.",
);
assert.match(
  rail,
  /xl:\[--reading-measure:52ch\]/,
  "Opening the recording pip must narrow the measure to 52ch — a reader comparing against a "
    + "recording reads in bursts, and 66ch is a measure for reading straight through.",
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

// ── The rail is 380px, and 380px is a decision ──────────────────────────────

// A summary is ~15 lines read in 30 seconds; the transcript beside it is ~600 lines read in ten
// minutes. `1fr 1fr` divides the screen by nominal importance. This divides it by reading volume.
assert.match(
  rail,
  /lg:grid-cols-\[minmax\(0,1fr\)_320px\] xl:grid-cols-\[minmax\(0,1fr\)_380px\]/,
  "Two regions: 380px of rail at ≥1280px, 320px between 1024 and 1280. Never a half-and-half "
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

assert.match(
  rail,
  /onMouseEnter=\{\(\) => onMark\(claim\.atMs\)\}[\s\S]{0,200}?onFocus=\{\(\) => onMark\(claim\.atMs\)\}/,
  "Pointing at a claim must mark its paragraph for a keyboard reader too, not only for a mouse.",
);
assert.match(
  rail,
  /onClick=\{\(\) => onJumpToMoment\(claim\.atMs\)\}/,
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

// A claim that cannot be checked is not rendered as though it could be. It is counted, and the
// reader is pointed at the tab where the whole summary is readable.
assert.match(
  rail,
  /if \(item\.atMs === null\) return;/,
  "A summary claim with no cited moment must not be rendered in the rail — a column whose whole "
    + "argument is that assertions have sources cannot open with an assertion that has none.",
);
assert.match(
  rail,
  /uncitedCount/,
  "The claims the rail refuses must be counted and pointed at, never silently dropped.",
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
