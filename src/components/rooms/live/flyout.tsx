"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";

/**
 * A drop-in replacement for `motion.div` that renders the flyout OUTSIDE whatever is clipping it.
 *
 * WHY IT EXISTS
 *   Every menu in the meeting control bar stopped appearing. The buttons still took the click —
 *   the gear even kept its focus ring — and nothing rendered.
 *
 *   WT-508 constrained the bar to the video stage column and gave its wrapper `overflow-x-auto`
 *   so a bar wider than the column could still be scrolled to. The scrolling is still wanted. But
 *   CSS has no "scroll one axis, overflow the other": when `overflow-x` is not `visible`, a
 *   `visible` `overflow-y` computes to `auto`. The wrapper therefore became a scroll container on
 *   BOTH axes, and every flyout here is positioned above the bar — outside that box, with no
 *   scrollable region up there to reveal it. One class, five menus gone at once, no error anywhere.
 *
 *   `position: fixed` does not fix it: the bar has `backdrop-blur-xl`, and a backdrop-filter makes
 *   an element the containing block for fixed descendants, putting them back inside the clip. The
 *   robust answer is to leave the subtree entirely, which is what a portal does.
 *
 * WHY THE CALLER STILL PASSES A SURFACE REF
 *   Portaled content is not a DOM descendant of the trigger, so an outside-click check against the
 *   trigger alone treats every click on the menu as outside and closes it on contact — a failure
 *   that looks identical to the one above. useFlyoutDismiss consults this ref as well.
 *
 * WHY IT IS SHAPED LIKE motion.div
 *   So each call site changes a tag name and its positioning classes, and nothing else: the
 *   AnimatePresence around it, the transition props and all the children stay exactly as they were.
 */

type Align = "left" | "right" | "center";

/** Matches the gap the old `bottom-[68px]` produced above a 60px bar. */
const GAP_PX = 8;
/** Never let a flyout rest against the viewport edge. */
const MARGIN_PX = 8;

type Placement = { left: number; bottom: number; maxHeight: number };

function measure(anchor: HTMLElement, width: number, align: Align): Placement {
  const rect = anchor.getBoundingClientRect();

  let left: number;
  if (align === "right") {
    left = rect.right - width;
  } else if (align === "center") {
    left = rect.left + rect.width / 2 - width / 2;
  } else {
    left = rect.left;
  }

  // Clamped, so a bar scrolled to one end cannot push its own menu off screen.
  const maxLeft = Math.max(MARGIN_PX, window.innerWidth - width - MARGIN_PX);

  return {
    left: Math.min(Math.max(left, MARGIN_PX), maxLeft),
    bottom: Math.max(MARGIN_PX, window.innerHeight - rect.top + GAP_PX),
    // It opens upward, so its room is whatever sits above the trigger.
    maxHeight: Math.max(160, rect.top - GAP_PX - MARGIN_PX),
  };
}

export function FlyoutSurface({
  anchorRef,
  surfaceRef,
  align = "left",
  style,
  ...motionProps
}: ComponentProps<typeof motion.div> & {
  /** Positioned against this element — normally the wrapper holding the trigger button. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Handed back so the caller's outside-click check can treat this surface as "inside". */
  surfaceRef: RefObject<HTMLDivElement | null>;
  align?: Align;
}) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [mounted, setMounted] = useState(false);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  // document.body does not exist during SSR, and this file is rendered from a client component
  // tree that is still prerendered.
  useEffect(() => setMounted(true), []);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const node = nodeRef.current;
    if (!anchor || !node) return;
    setPlacement(measure(anchor, node.offsetWidth, align));
  }, [align, anchorRef]);

  // Layout effect, not effect: the surface is measured in order to be placed, so running after
  // paint would show it at the wrong coordinates for a frame.
  useLayoutEffect(() => {
    if (!mounted) return;
    reposition();
  }, [mounted, reposition]);

  useEffect(() => {
    if (!mounted) return;
    // Capture phase for scroll: the bar's own wrapper scrolls horizontally and that scroll does
    // not bubble, so without it dragging the bar sideways would leave the menu behind.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [mounted, reposition]);

  if (!mounted) return null;

  return createPortal(
    <motion.div
      {...motionProps}
      ref={(node: HTMLDivElement | null) => {
        nodeRef.current = node;
        surfaceRef.current = node;
      }}
      style={{
        ...style,
        position: "fixed",
        left: placement?.left ?? 0,
        bottom: placement?.bottom ?? 0,
        maxHeight: placement?.maxHeight,
        // Placed before it is seen, rather than flashing at the wrong coordinates first.
        visibility: placement ? "visible" : "hidden",
      }}
    />,
    document.body,
  );
}
