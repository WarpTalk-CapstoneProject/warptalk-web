#!/usr/bin/env node
/**
 * Nothing in the meeting control bar may position a flyout with plain `absolute`.
 *
 * WHY THIS EXISTS
 *   Every menu in the bar stopped appearing at once — settings, host controls, reactions, the
 *   language picker, the device pickers and the clone-capture card. The buttons still took the
 *   click, the gear even kept its focus ring, and nothing rendered. No error, anywhere.
 *
 *   WT-508 constrained the bar to the video stage column and gave its wrapper `overflow-x-auto` so
 *   a bar wider than the column could still be scrolled to. CSS has no "scroll one axis, overflow
 *   the other": when `overflow-x` is not `visible`, a `visible` `overflow-y` computes to `auto`.
 *   Measured in a browser against the app's own classes: `overflow-y` reported `auto`, and a popup
 *   at `bottom: 68px` — above the wrapper's box — hit-tested as the stage behind it rather than
 *   itself. Clipped, with no scrollable region up there to reveal it.
 *
 *   The scrolling is still wanted, so the flyouts leave instead: FlyoutSurface portals them to
 *   document.body. `position: fixed` alone would not have done it — the bar has `backdrop-blur-xl`,
 *   and a backdrop-filter makes an element the containing block for fixed descendants, which puts
 *   them straight back inside the clip.
 *
 * THE RULE
 *   In these files, an upward-opening popup must be a FlyoutSurface. A bare `absolute bottom-…`
 *   is how the next one silently disappears, and it will look correct in review.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = [
  "src/components/rooms/live/meeting-control-bar.tsx",
  "src/components/rooms/live/media-device-menu.tsx",
];

const failures = [];

for (const file of FILES) {
  const source = readFileSync(join(root, file), "utf8");

  source.split("\n").forEach((line, index) => {
    // An upward-opening popup: absolutely positioned, anchored by its bottom edge.
    if (/\babsolute\b/.test(line) && /\bbottom-\[/.test(line)) {
      failures.push(
        `${file}:${index + 1}\n     ${line.trim()}\n     `
          + "This is an upward-opening popup positioned with `absolute`, so the control bar's "
          + "scroll-container wrapper will clip it away completely. Render it through "
          + "FlyoutSurface (src/components/rooms/live/flyout.tsx) instead.",
      );
    }
  });

  if (!/FlyoutSurface/.test(source)) {
    failures.push(
      `${file}: no FlyoutSurface anywhere. Every flyout here has to be portaled out of the bar's `
        + "scroll container; if this file genuinely has no flyouts left, drop it from FILES.",
    );
  }
}

// The portal is only correct if the dismiss checks consult the portaled surface too — otherwise
// the first click inside a menu closes it, which looks exactly like the clipping bug.
const bar = readFileSync(join(root, FILES[0]), "utf8");
if (!/surfaceRef\?\.current\?\.contains|surfaceRef\.current\?\.contains/.test(bar)) {
  failures.push(
    `${FILES[0]}: the outside-click check does not consult the portaled surface. Portaled content `
      + "is not a DOM descendant of the trigger, so every click inside a menu reads as outside and "
      + "dismisses it on contact.",
  );
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log("PASS control bar flyouts are portaled out of the scroll container");
