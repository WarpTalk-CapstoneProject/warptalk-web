#!/usr/bin/env node
/**
 * The summary panel must read its state from `resolveSummaryState`, and must not offer a
 * download for a summary that is not there.
 *
 * WHY THIS EXISTS (WT-369)
 *   `resolveSummaryState` was written, documented and unit-tested — and called from nowhere.
 *   `grep` for it outside its own module returned exactly zero hits while its own doc comment
 *   described the line it had been written to replace:
 *
 *       const isGenerating = !artifact && recentlyEnded;
 *
 *   ...which was still sitting in meeting-record-panels.tsx, untouched. So the tests passed, the
 *   helper was "done", and production kept the behaviour it was supposed to have fixed: an
 *   artifact that existed but was still processing rendered "This meeting ended without a summary
 *   artifact" directly above its own Download button.
 *
 *   That is the same failure as the orphaned `test:*` scripts this repo already guards against
 *   (see check-test-scripts-wired.mjs): work that is complete, correct, and connected to nothing.
 *
 * THE RULES
 *   1. meeting-record-panels.tsx imports and calls resolveSummaryState.
 *   2. The `!artifact && recentlyEnded` flag does not come back.
 *   3. The Download button is gated on the resolved state, not merely on the artifact row
 *      existing — the finalizer writes a SUMMARY_EXPORT row even when the AI worker produced
 *      nothing, so the row is not evidence of a summary.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const PANEL = "src/components/rooms/meeting-record-panels.tsx";
const MAPPING = "src/lib/meeting/room-history-mapping.ts";

/**
 * Comments are stripped before the "this must not come back" checks run.
 *
 * Not optional: the fix's own comment quotes the bad line verbatim to explain what it replaced,
 * and the first version of this script promptly failed on that explanation. A contract that
 * cannot tell code from a note about code punishes writing the note.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments, including the {/* … */} JSX bodies
    .replace(/^\s*\/\/.*$/gm, ""); // whole-line // comments
}

const failures = [];
const panel = read(PANEL);
const panelCode = stripComments(panel);
const mapping = read(MAPPING);

if (!/export function resolveSummaryState/.test(mapping)) {
  failures.push(
    `${MAPPING}: resolveSummaryState is gone. If it was replaced, update this contract to pin ` +
      `whatever now owns the four summary states.`,
  );
}

// ---- Rule 1: it is actually wired in ------------------------------------------------------
if (!/import\s*\{[^}]*resolveSummaryState[^}]*\}\s*from\s*"@\/lib\/meeting\/room-history-mapping"/.test(panel)) {
  failures.push(
    `${PANEL}: does not import resolveSummaryState. A tested helper that nothing calls is not a ` +
      `fix — it is a fix-shaped file (WT-369).`,
  );
}

if (!/resolveSummaryState\s*\(/.test(panel)) {
  failures.push(`${PANEL}: imports resolveSummaryState but never calls it.`);
}

// ---- Rule 2: the collapsed flag does not return --------------------------------------------
if (/!artifact\s*&&\s*recentlyEnded/.test(panelCode)) {
  failures.push(
    `${PANEL}: the \`!artifact && recentlyEnded\` flag is back. It cannot tell "still processing" ` +
      `from "never arrived", which is how "This meeting ended without a summary artifact" came to ` +
      `be printed above a working Download button.`,
  );
}

// ---- Rule 3: the download is gated on there BEING a summary --------------------------------
// The artifact row is written even when the AI worker produced nothing (insufficientData), so
// `{artifact ? <Download/> : null}` offers a file whose only content says there is no summary.
if (/\{\s*artifact\s*\?\s*\(/.test(panelCode)) {
  failures.push(
    `${PANEL}: the Download button is rendered on \`artifact\` alone. ArtifactsFinalizer writes a ` +
      `SUMMARY_EXPORT row even for a meeting with no summary, so the row proves nothing — gate on ` +
      `the resolved summary state instead.`,
  );
}

if (!/artifact\s*&&\s*summaryState\s*===\s*"ready"/.test(panel)) {
  failures.push(
    `${PANEL}: expected the Download button to be gated on \`artifact && summaryState === "ready"\`.`,
  );
}

if (failures.length > 0) {
  console.error("summary-state-wired contract FAILED:\n");
  for (const f of failures) console.error(`  • ${f}\n`);
  process.exit(1);
}

console.log("summary-state-wired contract OK");
