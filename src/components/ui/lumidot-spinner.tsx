"use client";

/**
 * The one loading mark in the product, at the one size it comes in.
 *
 * WHY THIS EXISTS
 *   `<Lumidot>` was called directly from six places, and each one wrapped it in its own transform:
 *   `scale-75` in the widget, `scale-[0.42]` on the meeting chat's thinking line, nothing at all
 *   in the dialogs and the people panel. So the same "working" mark appeared at three different
 *   sizes depending on where you happened to be looking, and inside a single trail the steps did
 *   not match the loader above them.
 *
 *   The colour was copy-pasted too — `resolvedTheme === "dark" ? "white" : "black"` appeared
 *   verbatim in five components. Five copies of a rule is five chances for the sixth caller to
 *   pick something else.
 *
 *   Both now live here. A caller chooses WHERE the mark goes; it does not get to choose how big
 *   it is or what colour, because those are not per-surface decisions.
 *
 * SIZE
 *   One box, `LUMIDOT_BOX_PX`, so a mark can sit inline in a 12px row without pushing the line
 *   height around and still read as the same object as the standalone loader in a dialog. The
 *   `scale` prop is Lumidot's own — an outer CSS transform scales the glow into a blur and
 *   leaves the element's layout box at its unscaled size, which is what made these hard to line
 *   up in the first place.
 */

import { Lumidot } from "lumidot";

import { cn } from "@/lib/utils";

/** The footprint every loading mark occupies, everywhere. */
export const LUMIDOT_BOX_PX = 16;

/** Fills the box above without clipping the glow. */
const LUMIDOT_SCALE = 0.5;

export function LumidotSpinner({
  className,
  label,
}: {
  className?: string;
  /**
   * Announced to a screen reader when this mark is the ONLY thing saying work is happening.
   * Left unset where visible text beside it already says so — two announcements of one fact is
   * worse than none.
   */
  label?: string;
}) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      // `lumidot-mark` is what colours the dots — see globals.css. The variant below is a
      // placeholder the stylesheet overrides, and it is fixed on purpose: choosing it from
      // `useTheme()` is a hydration mismatch, because the server cannot know the theme. Every
      // page carrying a spinner logged one until this moved into CSS.
      className={cn("lumidot-mark inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: LUMIDOT_BOX_PX, height: LUMIDOT_BOX_PX }}
    >
      <Lumidot variant="black" pattern="frame" glow={4} scale={LUMIDOT_SCALE} />
    </span>
  );
}

/**
 * The same footprint, holding a static dot instead — for a step that has finished.
 *
 * Shares the box on purpose: a step that swaps a spinner for a dot must not move by a pixel at
 * the moment it finishes, which reads as the whole list twitching.
 */
export function LumidotSpinnerPlaceholder({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: LUMIDOT_BOX_PX, height: LUMIDOT_BOX_PX }}
    >
      <span className="size-[5px] rounded-full bg-hairline-strong" />
    </span>
  );
}
