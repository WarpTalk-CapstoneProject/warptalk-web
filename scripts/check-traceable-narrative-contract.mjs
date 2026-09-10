#!/usr/bin/env node
/**
 * WT-663 — the summary's opening paragraph, made answerable.
 *
 * WHY THIS EXISTS
 *   The rail's argument is that a claim in it has a source you can reach. The overview paragraph
 *   was the one block that did not: no moment, no jump, no highlight, printed largest and read
 *   first. The traceable template replaces it with a `narrative` section whose sentences each
 *   carry their own moments, and this file pins the two halves of that which are easy to undo by
 *   accident.
 *
 *   The first half is the rendering. A sentence is not a row, and the obvious edit — "why does
 *   this section have its own component, let's just use RailClaimButton" — is exactly the change
 *   that turns the paragraph back into a striped table of timestamps. It looks tidier in the diff
 *   and worse on the screen, which is the kind of regression nothing else catches.
 *
 *   The second half is what replaced the timestamp line. Dropping it removed the only rest-state
 *   sign that these words are clickable, so three quieter signs pay for it: a faint left bar, one
 *   line of guidance per section, and the moments themselves on hover and focus. Delete any one
 *   and the section still renders perfectly while quietly becoming unclickable-looking prose.
 *
 * WHAT IT DOES NOT PIN
 *   The wording of any comment, and the wording of the sentences themselves. Behaviour only —
 *   which branch renders what, which element is a control, and which state each class carries.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { stripComments } from "./lib/strip-comments.mjs";

const root = path.resolve(import.meta.dirname, "..");
/** Comments blanked out: a note explaining a rule contains the rule, and a scan cannot tell them
 *  apart. Every assertion below is therefore about code, never about prose describing it. */
const read = (rel) => stripComments(fs.readFileSync(path.join(root, rel), "utf8"));

const rail = read("src/components/rooms/meeting-reading-rail.tsx");
const preview = read("src/app/dev/transcript-preview/page.tsx");

/** One declaration's source, from its opening line to the line that closes it at `closer`. */
function block(source, opener, closer) {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, `Expected to find \`${opener}\` in the reading rail.`);
  const end = source.indexOf(closer, start);
  return source.slice(start, end === -1 ? source.length : end + closer.length);
}

const sentence = block(rail, "function RailNarrativeSentence(", "\n}\n");
const markClaim = block(rail, "function markClaim(", "\n  }\n");

// ── The narrative is drawn as prose, every other section as rows ────────────

assert.match(
  rail,
  /NARRATIVE_SECTION_KEY = "narrative"/,
  "The section the AI emits as `narrative` must be named once, as the one key this file branches "
    + "on, rather than compared as a bare string wherever it happens to be needed.",
);
assert.match(
  rail,
  /sectionKey === NARRATIVE_SECTION_KEY \? \(\s*<RailNarrativeSentence/,
  "The narrative section must render through the sentence variant. Rendering it through "
    + "RailClaimButton gives six consecutive sentences a mono timestamp line apiece, which is a "
    + "table, not the paragraph this section exists to keep readable.",
);
// The other half of the same branch, and the reason this is a branch rather than a replacement:
// a decision IS a row, and the timestamp under it is what a reader scanning a list came for.
assert.match(
  rail,
  /\) : \(\s*<RailClaimButton/,
  "Every other section must keep RailClaimButton — decisions and action items are lists, and "
    + "nothing in this ticket changes how a list is drawn.",
);
assert.match(
  rail,
  /claim\.atMs === null \? "no moment recorded" : formatCitationTime\(claim\.atMs\)/,
  "The claim button must keep printing its moment, or its absence, on its own line.",
);

// ── A sentence carries no timestamp line, no rule and no underline ──────────

assert.doesNotMatch(
  sentence,
  /no moment recorded/,
  "A narrative sentence must not print a timestamp line of its own — that is the change that "
    + "turns the paragraph into a table.",
);
assert.doesNotMatch(
  sentence,
  /border-b|border-t|divide-y|underline|<hr/,
  "No rules and no underlines between sentences. This was tried once in the mockup and it striped "
    + "the paragraph into rows just as effectively as the timestamps did.",
);

// ── The three things that replaced the timestamp line ───────────────────────

// 1. At rest the left bar is the accent, faint — the slot was already reserved as `border-l-2`
//    and was set to transparent, which is indistinguishable from no control at all.
assert.match(
  sentence,
  /border-l-primary\/20/,
  "At rest a citable sentence must show its left bar faintly. Transparent is what the row with no "
    + "source looks like, and the two must not look the same.",
);
assert.match(
  sentence,
  /border-l-primary bg-primary\/10/,
  "The lit state — the reader scrolled the transcript onto this sentence's evidence — must use the "
    + "same accent fill the claim button uses, so one highlight means one thing across the rail.",
);

// 2. Said once under the heading. Repeated per row it is the striped table again, in words.
assert.match(
  rail,
  /claim\.heading && claim\.sectionKey === NARRATIVE_SECTION_KEY/,
  "The guidance line must be gated on the section's heading, so it appears once per section rather "
    + "than beside every sentence.",
);
assert.match(
  rail,
  /Click a sentence to see where it came from\./,
  "The section must say, once, that its sentences are clickable. It is the only rest-state "
    + "instruction left after the timestamp line went.",
);

// 3. The moments arrive on hover AND on focus, and they hold their space at rest. Unmounting them
//    reflows the paragraph under the pointer that is trying to read it.
assert.match(
  sentence,
  /opacity-0 group-hover:opacity-100 group-focus:opacity-100/,
  "The moments must be hidden rather than absent, and must appear for a keyboard reader on focus "
    + "as well as for a pointer on hover.",
);
assert.match(
  sentence,
  /formatCitationTime\(/,
  "The moments must be printed through the shared formatter, not a second mm:ss rule.",
);

// ── A sentence with no moment is not a control ─────────────────────────────

const unsourced = block(sentence, "if (claim.atMs === null) {", "\n  }\n");
assert.doesNotMatch(
  unsourced,
  /<button/,
  "A sentence with no recorded moment must not be a button. The missing affordance is the message: "
    + "it says 'this one has no source' before the reader spends a click finding out.",
);
assert.doesNotMatch(
  unsourced,
  /border-l-primary/,
  "A sentence with no recorded moment gets no left bar. A bar it cannot honour is the same lie as "
    + "a citation it does not have.",
);

// ── Both directions carry the whole group, not just the first moment ───────

assert.match(
  sentence,
  /onMouseEnter=\{\(\) => onMark\(atMs, claim\.alsoAtMs\)\}/,
  "Hovering a sentence must mark every turn it rests on. Marking only the primary moment leaves "
    + "the reply half of an exchange unlit while the reader is looking straight at it.",
);
assert.match(
  sentence,
  /onFocus=\{\(\) => onMark\(atMs, claim\.alsoAtMs\)\}/,
  "A keyboard reader tabbing the rail must get exactly what a pointer gets.",
);
assert.match(
  sentence,
  /onClick=\{\(\) => onJumpToMoment\(atMs\)\}/,
  "A click still lands on the primary moment — the group is what lights up, not what a jump has to "
    + "choose between.",
);
assert.match(
  rail,
  /alsoAtMs: claim\.alsoAtMs/,
  "The citation list handed to groupCitationsByAnchor must carry the whole group, or the reverse "
    + "direction goes dark the moment the reader scrolls from the first turn to the second.",
);

// ── The rail publishes a SET of keys, through the set-shaped API ────────────

assert.match(
  markClaim,
  /sync\.setMarkedKeys\(/,
  "markClaim must publish through setMarkedKeys. The single-key setter cannot carry a sentence "
    + "that rests on more than one turn, which is the whole of this ticket.",
);
assert.doesNotMatch(
  rail,
  /sync\.setMarkedKey\(/,
  "Nothing in the rail may still write through the single-key compatibility setter.",
);
assert.match(
  markClaim,
  /new Set<string>\(\)/,
  "The anchor keys must be de-duplicated before they are published: several moments of one "
    + "sentence commonly land in the same turn, and a key published twice is one turn counted "
    + "twice by anything downstream that counts rather than merely tests membership.",
);

// ── The preview must actually exercise this without a meeting ──────────────
//
// /dev/transcript-preview is the only way to look at this feature on a laptop. A fixture that
// declares a narrative but gives every sentence a single moment proves nothing about the case the
// ticket is for.
assert.match(
  preview,
  /key: "narrative"/,
  "The transcript preview must render a narrative section, or there is no way to look at this "
    + "outside a real meeting written in the traceable template.",
);
const narrativeFixture = block(preview, 'key: "narrative"', "\n  },\n");
assert.match(
  narrativeFixture,
  /alsoAtMs: \[\s*\d[\d_]*/,
  "At least one narrative sentence in the preview must rest on more than one moment. Without it "
    + "neither the two-turn highlight nor the de-duplication is reachable on a laptop.",
);
assert.match(
  narrativeFixture,
  /atMs: null/,
  "The preview must also carry a sentence with no moment, so the bar-less, click-less rendering "
    + "can be looked at beside the sentences that do have a source.",
);

console.log("Traceable narrative contract (WT-663): PASS");
