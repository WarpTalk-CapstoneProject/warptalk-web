"use client";

/**
 * A text tooltip for explaining a figure: "derived from the rate card", "no consumer seen".
 *
 * The admin portal explained these with the native `title` attribute, which renders late, in the
 * OS's own style, never on keyboard focus and never on touch. This is the Base UI tooltip, and it
 * is built so no parent can clip it: the popup is portalled to <body>, positioned with collision
 * avoidance (it flips and shifts to stay on screen), sits above page chrome at z-50 like every
 * other popover here, and is drawn from theme tokens so light and dark both read.
 *
 * Usage: `<Tooltip content="…"><span>figure</span></Tooltip>`. The child must be a single element
 * that can hold a ref; it becomes the trigger without a wrapper, so layout is unchanged. The
 * trigger gets `tabIndex=0` so the explanation is reachable from the keyboard too.
 */

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  /** Null or empty renders the child alone — no empty bubble. */
  content: ReactNode;
  children: ReactElement<{ tabIndex?: number }>;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  if (content === null || content === undefined || content === "" || !isValidElement(children)) {
    return children;
  }
  const trigger = children.props.tabIndex === undefined ? cloneElement(children, { tabIndex: 0 }) : children;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={trigger} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} sideOffset={6} collisionPadding={8} className="isolate z-50">
          <TooltipPrimitive.Popup
            className={cn(
              "max-w-[280px] rounded-md border border-border bg-popover px-2.5 py-1.5 text-[12px] leading-[1.4] text-popover-foreground shadow-md",
              "origin-(--transform-origin) transition-[opacity,transform] duration-100 data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0",
              className,
            )}
          >
            {content}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
