// Every page inside the workspace shell sits on the shell's `bg-panel` ground and paints none of
// its own.
//
// The shell box in `src/app/(app)/layout.tsx` is `bg-panel`, and the ladder is canvas (chrome) →
// panel (page) → surface-1 (cards). A page whose root is `bg-surface-1` renders as a white slab
// with its white cards sunk into it — the complaint that started the grey ground — and a root of
// `bg-canvas` renders a darker hole in the panel. Both shipped after the ground changed: Billing,
// Invoices and Usage kept their old white roots, Payments copied Billing's, and four loading and
// error states still painted the chrome's grey.
//
// Source-level, like the other surface contracts: a class name on a wrapper is invisible to types
// and to every unit test. A white element is fine when it is a CARD — it carries a border, a
// radius, a shadow or a ring — or when it is positioned over something else; only a bare ground
// is refused.

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE_ROOT = "src/app/(app)/[workspaceSlug]";

const EXEMPT = [
  // The live meeting renders its own stage, not a settings or list page on the panel.
  /\/rooms\/\[id\]\/live\//,
  // Cells of one bordered box: each paints itself white and the 1px gaps show the box's hairline
  // colour through as dividers. The white belongs to the card, which is drawn by MetricGrid.
  /\/settings\/billing\/components\/metric-grid\.tsx$/,
];

async function tsxFiles(dir) {
  const found = [];
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await tsxFiles(rel)));
    else if (entry.name.endsWith(".tsx")) found.push(rel);
  }
  return found;
}

const CARD = /(^|\s)(border|rounded|shadow|ring|absolute|fixed|sticky|inset-)/;
const LAYOUT = /(^|\s)(flex|grid|block|min-h-|h-\[|h-full|h-screen|h-dvh|h-96|w-full|px-|py-|p-\d|mx-auto|max-w-)/;

const failures = [];
let checked = 0;
for (const rel of await tsxFiles(PAGE_ROOT)) {
  if (EXEMPT.some((pattern) => pattern.test(rel))) continue;
  checked += 1;
  const lines = (await readFile(path.join(root, rel), "utf8")).split("\n");
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/className="([^"]*)"/g)) {
      const classes = match[1];
      const white = /(^|\s)bg-(surface-1|background|white|card)(\s|$)/.test(classes);
      const chrome = /(^|\s)bg-canvas(\s|$)/.test(classes);
      if (!(white || chrome) || CARD.test(classes) || !LAYOUT.test(classes)) continue;
      // A full-viewport screen (the workspace layout's own loading state) renders INSTEAD of the
      // shell, so there is no panel under it and the chrome's ground is the right one.
      if (/(^|\s)(h-dvh|w-screen)(\s|$)/.test(classes)) continue;
      failures.push(`${rel.replace(`${PAGE_ROOT}/`, "")}:${index + 1}: ${classes}`);
    }
  });
}

if (checked < 20) failures.push(`only ${checked} files found under ${PAGE_ROOT}; the walk is broken`);

if (failures.length) {
  console.error("FAIL page grounds: these elements paint their own background over the shell's bg-panel:");
  for (const failure of failures) console.error(`  ${failure}`);
  console.error("Remove the background (the page inherits bg-panel), or make it a card with a border and radius.");
  process.exitCode = 1;
} else {
  console.log(`PASS page grounds: ${checked} workspace page files paint no ground of their own`);
}
