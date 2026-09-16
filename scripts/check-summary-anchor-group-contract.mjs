#!/usr/bin/env node
/**
 * A summary sentence rests on a GROUP of turns, and both ends of the transcript column must
 * treat it as one.
 *
 * WHY THIS EXISTS (WT-663)
 *   An item used to carry exactly one moment. That is the wrong unit for a sentence summarising
 *   an exchange: "Kenji carried on with the install" at 0:45 and the "ok, taking it" at 1:02 are
 *   two turns by two speakers, and a single anchor lit one of them. The reader was shown half the
 *   evidence for a claim about both, with nothing on screen admitting the other half existed.
 *
 *   Widening the contract was the easy half — `alsoAtMs` on the item, `markedKeys` on the sync.
 *   The half that rots is the consumers: both a `=== turn.key` comparison and a
 *   `=== segment.id` comparison keep compiling forever against the new shape while quietly
 *   answering the old question, and the symptom is one lit turn, which looks like a working
 *   feature.
 *
 * WHAT IS PINNED, AND WHAT DELIBERATELY IS NOT
 *   Behaviour, not wording. This repo has already learned that grepping the prose of a comment
 *   produces a test people route around by rewording the comment — see the stripComments note in
 *   check-summary-state-wired.mjs, where the fix's own explanation failed the first version of
 *   its own contract. So every rule below matches an expression that does something.
 *
 * THE RULES
 *   1. The transcript column reads `markedKeys`, and the compatibility `markedKey` is gone from it.
 *   2. It asks that question through a SET built once per render, not by scanning the list per
 *      turn — this runs on every block of a document that is routinely several hundred of them.
 *   3. The click highlight is a set of segment ids, not one id, and a row's `highlighted` is a
 *      membership test.
 *   4. A turn still lights when any of its lines does — the `rows.some(...)` both grouped layouts
 *      derive. Nothing in this wave should have touched it, and if something did, it was this.
 *   5. `jumpToTranscriptMoment` takes the supporting moments, resolves every one of them, and
 *      highlights all the segments they land in.
 *   6. It scrolls and seeks to the EARLIEST resolved segment, sorted on the segment's own
 *      `startTimeMs` — `atMs` is the primary moment, not necessarily the first one, and a reader
 *      dropped into the middle of the evidence has to scroll backwards to find its beginning.
 *   7. The "not in the saved transcript" toast fires only when NO moment resolved. A group where
 *      some of them did is a jump that worked.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const PANEL = "src/components/rooms/meeting-transcript-panel.tsx";
const PAGE = "src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx";
const SYNC = "src/components/rooms/transcript-reading-sync.tsx";

/**
 * Comments out, before anything is asserted about what the code says.
 *
 * The "this must not come back" rules below name the old expressions verbatim, and the files they
 * run over explain at length what those expressions were and why they went. A contract that cannot
 * tell code from a note about code punishes writing the note.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** One brace-balanced region, so a rule about the jump cannot be satisfied elsewhere on a
 *  2,600-line page. Starts at `marker` and ends where the parenthesis opened after it closes. */
function callbackBody(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) return null;
  const open = source.indexOf("(", start);
  if (open === -1) return null;

  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

const failures = [];
const panel = stripComments(read(PANEL));
const page = stripComments(read(PAGE));
const sync = read(SYNC);

// ---- The contract this is written against still exists ------------------------------------
if (!/markedKeys:\s*readonly string\[\]/.test(sync)) {
  failures.push(
    `${SYNC}: markedKeys is gone from the sync. If the wire changed shape, update this contract ` +
      `to pin whatever now carries the group of turns a claim rests on.`,
  );
}

// ---- Rule 1: the column reads the set, not the compatibility single ------------------------
if (/markedKey(?!\w)/.test(panel)) {
  failures.push(
    `${PANEL}: still reads \`markedKey\`. It is the FIRST of markedKeys and nothing more, so a ` +
      `comparison against it lights one turn of an exchange and leaves the reply dark — the exact ` +
      `bug WT-663 widened the contract to fix.`,
  );
}

if (!/sync\?\.markedKeys/.test(panel)) {
  failures.push(`${PANEL}: does not read \`sync?.markedKeys\`.`);
}

// ---- Rule 2: membership, not a scan per turn ------------------------------------------------
// Every rendered block asks this, on every pointer move inside a rail item. A per-turn scan of the
// key list makes hovering one claim cost turns x keys.
if (!/new Set\(\s*markedKeys\s*\)/.test(panel)) {
  failures.push(
    `${PANEL}: expected the marked keys to be turned into a Set once per render. Scanning the ` +
      `array per turn is O(turns x keys) on a column of several hundred blocks.`,
  );
}

if (/markedKeys[^\n]{0,60}\.(includes|indexOf|some|find)\(/.test(panel)) {
  failures.push(
    `${PANEL}: scans \`markedKeys\` directly. Ask the derived Set instead — see the note on ` +
      `markedKeySet.`,
  );
}

if (!/marked=\{[^}]*\.has\(/.test(panel)) {
  failures.push(
    `${PANEL}: the \`marked\` prop is not a set membership test. Every turn a claim rests on has ` +
      `to light, not just the first.`,
  );
}

// ---- Rule 3: the click highlight is a set of ids --------------------------------------------
if (/highlightedSegmentId(?!\w)/.test(panel) || /highlightedSegmentId(?!\w)/.test(page)) {
  failures.push(
    `${PANEL} / ${PAGE}: \`highlightedSegmentId\` is back. One id can only ring one turn, and a ` +
      `citation resting on an exchange rings the wrong half of it.`,
  );
}

if (!/highlightedSegmentIds\?\.has\(/.test(panel)) {
  failures.push(
    `${PANEL}: a row's \`highlighted\` is not resolved by membership in highlightedSegmentIds.`,
  );
}

// ---- Rule 4: a turn still lights when any of its lines does ----------------------------------
// A citation lands on a LINE; the block is what the reader sees as one thing. Both grouped
// layouts derive it, and neither should have changed in this wave.
const turnLevelDerivations = panel.match(/rows\.some\(\(row\) => row\.highlighted\)/g) ?? [];
if (turnLevelDerivations.length < 2) {
  failures.push(
    `${PANEL}: expected both grouped layouts to derive a turn's highlight from its rows ` +
      `(\`rows.some((row) => row.highlighted)\`); found ${turnLevelDerivations.length}.`,
  );
}

// ---- Rules 5-7: the jump takes the whole group ------------------------------------------------
const jump = callbackBody(page, "const jumpToTranscriptMoment");
if (!jump) {
  failures.push(`${PAGE}: jumpToTranscriptMoment is gone, or no longer a callback this can read.`);
} else {
  if (!/\(\s*atMs\s*:\s*number\s*,/.test(jump)) {
    failures.push(
      `${PAGE}: jumpToTranscriptMoment still takes one moment. A claim carries \`atMs\` AND ` +
        `\`alsoAtMs\`, and dropping the second silently discards most of its evidence.`,
    );
  }

  if (!/\[\s*atMs\s*,\s*\.\.\.\s*alsoAtMs\s*\]/.test(jump)) {
    failures.push(
      `${PAGE}: expected every moment — the primary one and the supporting ones — to be resolved ` +
        `through findSegmentAtMs.`,
    );
  }

  if (!/\.startTimeMs\s*-\s*[\w.]*\.startTimeMs/.test(jump)) {
    failures.push(
      `${PAGE}: the resolved segments are not sorted on their own startTimeMs. \`atMs\` is the ` +
        `PRIMARY moment, not the earliest, so arrival order can open the reader at the reply.`,
    );
  }

  if (/requestSeek\(\s*atMs\s*\)/.test(jump)) {
    failures.push(
      `${PAGE}: seeks the recording to the raw cited moment. It must go to the start of the ` +
        `earliest resolved segment — the beginning of the evidence, not the middle of it.`,
    );
  }

  if (!/setHighlightedSegmentIds\(\s*new Set\(/.test(jump)) {
    failures.push(
      `${PAGE}: does not highlight a set of segments. Several moments commonly land in the same ` +
        `turn, so the ids are de-duplicated and ALL of them are marked.`,
    );
  }

  const toast = jump.indexOf('toast.error("That moment is not in the saved transcript.")');
  const resolve = jump.indexOf("findSegmentAtMs");
  if (toast === -1) {
    failures.push(
      `${PAGE}: the "not in the saved transcript" toast is gone. A citation into a trimmed ` +
        `transcript still has to say so rather than doing nothing.`,
    );
  } else if (resolve === -1 || toast < resolve) {
    failures.push(
      `${PAGE}: the failure toast is raised before the group has been resolved. It may only fire ` +
        `when NO moment in the group landed — a group where some did is a jump that worked.`,
    );
  }
}

if (failures.length > 0) {
  console.error("summary-anchor-group contract FAILED:\n");
  for (const f of failures) console.error(`  • ${f}\n`);
  process.exit(1);
}

console.log("summary-anchor-group contract OK");
