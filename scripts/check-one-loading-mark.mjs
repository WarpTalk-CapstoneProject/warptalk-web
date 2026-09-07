#!/usr/bin/env node
/**
 * One loading mark, at one size, everywhere.
 *
 * `<Lumidot>` used to be called from six components, each wrapping it in its own transform:
 * `scale-75` in the widget, `scale-[0.42]` on the meeting chat's thinking line, nothing at all in
 * the dialogs and the people panel. Three sizes for one idea, and inside a single trail the step
 * marks did not match the loader above them.
 *
 * The colour rule was copy-pasted five times as well — `resolvedTheme === "dark" ? "white" :
 * "black"` — which is five chances for the sixth caller to choose differently.
 *
 * Neither is visible in a screenshot of any ONE surface, which is why it survived until somebody
 * put two of them side by side. So it is asserted across the tree instead.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "src");
const WRAPPER = path.join(SRC, "components/ui/lumidot-spinner.tsx");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const offenders = { rawLumidot: [], ownColour: [], ownScale: [] };

for (const file of files) {
  if (file === WRAPPER) continue;
  const source = readFileSync(file, "utf8");
  const relative = path.relative(root, file);

  if (/<Lumidot\b/.test(source)) offenders.rawLumidot.push(relative);
  if (/resolvedTheme === "dark" \? "white" : "black"/.test(source)) offenders.ownColour.push(relative);
  // A transform wrapped around the mark is how the sizes drifted in the first place.
  if (/scale-\[?[\d.]+\]?[^\n]{0,120}\n?[^\n]{0,120}<Lumidot/.test(source)) offenders.ownScale.push(relative);
}

assert.deepEqual(
  offenders.rawLumidot,
  [],
  `Use <LumidotSpinner /> instead of <Lumidot> directly — it owns the size and the colour, which is what stops a fourth size appearing. Offenders: ${offenders.rawLumidot.join(", ")}`,
);
assert.deepEqual(
  offenders.ownColour,
  [],
  `The dark/light rule for the loading mark lives in lumidot-spinner. Offenders: ${offenders.ownColour.join(", ")}`,
);
assert.deepEqual(
  offenders.ownScale,
  [],
  `No CSS transform around the loading mark — an outer scale blurs the glow and leaves the layout box at its unscaled size, which is exactly how these stopped lining up. Offenders: ${offenders.ownScale.join(", ")}`,
);

// The wrapper itself must keep a FIXED box, or "one size" becomes whatever each caller's line
// height happens to be.
const wrapper = readFileSync(WRAPPER, "utf8");
assert.match(
  wrapper,
  /LUMIDOT_BOX_PX\s*=\s*\d+/,
  "The shared mark must declare one box size.",
);
// Checked PER COMPONENT, not once across the file. Matching the whole file passes while only
// one of the two applies the constant — verified: hardcoding the spinner's box to 12px slipped
// past the file-wide version of this assertion, because the placeholder still carried it.
const placeholderAt = wrapper.indexOf("export function LumidotSpinnerPlaceholder");
assert.ok(placeholderAt > 0, "The finished-step mark must exist.");
const spinnerBlock = wrapper.slice(wrapper.indexOf("export function LumidotSpinner"), placeholderAt);
const placeholderBlock = wrapper.slice(placeholderAt);

assert.match(
  spinnerBlock,
  /width: LUMIDOT_BOX_PX, height: LUMIDOT_BOX_PX/,
  "The shared mark must APPLY its box size — a constant nothing reads is a comment.",
);
// The finished-step placeholder shares that box on purpose: a step must not shift by a pixel at
// the moment it stops spinning, which reads as the whole list twitching.
assert.match(
  placeholderBlock,
  /width: LUMIDOT_BOX_PX, height: LUMIDOT_BOX_PX/,
  "The finished-step mark must occupy the same box as the running one.",
);

// And the trail must actually use them, rather than drawing its own dot again.
const trail = readFileSync(path.join(SRC, "components/assistant/assistant-work-trail.tsx"), "utf8");
assert.match(
  trail,
  /<LumidotSpinner \/>/,
  "A running step must carry the product's loading mark, not a bespoke dot.",
);
assert.match(
  trail,
  /<LumidotSpinnerPlaceholder \/>/,
  "A finished step must keep the running mark's footprint.",
);

console.log(`One loading mark OK (${files.length} files checked, no raw <Lumidot>, one box)`);
