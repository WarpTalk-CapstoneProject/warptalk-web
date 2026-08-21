"use client";

import { ArrowDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The way back to the newest line.
 *
 * Floats over the bottom of a scroller rather than sitting under it, because the panels it
 * appears in are already as tall as they are allowed to be — a row reserved for a control that is
 * usually hidden would cost every reader height to serve the one who scrolled up.
 *
 * The parent must be `relative`. It is `pointer-events-none` while hidden so it cannot swallow a
 * click on the last line underneath it.
 */
export function ScrollToLatestChip({
  visible,
  onClick,
  className,
  label = "Latest",
}: {
  visible: boolean;
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center transition-opacity duration-150",
        visible ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      <button
        type="button"
        // Hidden from the tab order and from a screen reader when it is not offered — a button
        // that is invisible and still focusable is a trap that scrolls the page for no reason.
        tabIndex={visible ? 0 : -1}
        aria-hidden={!visible}
        onClick={onClick}
        className={cn(
          "pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-1 py-1.5 pl-2.5 pr-3.5 text-[12px] font-medium text-ink shadow-[0_2px_10px_rgba(0,0,0,0.10)] transition-colors hover:bg-surface-2",
          visible ? "" : "pointer-events-none",
        )}
      >
        <ArrowDown className="size-3.5" />
        {label}
      </button>
    </div>
  );
}

/**
 * The soft edge under a scroller, so content reads as continuing rather than as cut off.
 *
 * A gradient AND a blur: the gradient alone leaves sharp glyph edges showing through its own
 * fade, which looks like a rendering fault rather than depth. Backdrop-blur alone frosts the
 * whole strip evenly and hides the last line the reader was following.
 *
 * Masked so the blur itself fades out with the gradient — an unmasked backdrop-filter has a hard
 * top edge, and a hard line is exactly what this exists to remove.
 */
export function ScrollFadeEdge({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-16 backdrop-blur-[3px]",
        className,
      )}
      style={{
        background: "linear-gradient(to top, var(--surface-1) 15%, transparent)",
        maskImage: "linear-gradient(to top, black 45%, transparent)",
        WebkitMaskImage: "linear-gradient(to top, black 45%, transparent)",
      }}
    />
  );
}
