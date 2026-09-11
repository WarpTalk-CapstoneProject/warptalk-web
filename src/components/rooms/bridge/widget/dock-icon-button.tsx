"use client";

/**
 * The one icon-only button of the Meet widget. WT-525.
 *
 * Every square control in the dock and the header (Start/Stop, Pause transcript, settings, and
 * whatever t3/t4 add) is this component, so the widget has one size, one focus ring and one way
 * of saying what an icon does.
 *
 * WHY IT MUST NOT LOOK LIKE MEET'S CALL BAR
 *   The widget floats right above Google Meet's own controls — round buttons and a red hang-up.
 *   A second row of round buttons over that is a second call bar, and the red one in it would be
 *   read as "leave the call". So: squared (9px radius, not a circle), bordered, and no tone that
 *   fills red. `danger` colours the ICON only, which is also what the design gives Stop
 *   translation.
 *
 * WHY THE TOOLTIP IS CSS, NOT A COMPONENT
 *   There is no Tooltip in components/ui, and package.json is not ours to add one to. A CSS
 *   tooltip also suits this window better than a portalled one: it is 460px wide and always on
 *   top, and a tooltip that renders inside the button's own box cannot end up behind Meet or
 *   outside the window. The label shows on hover and on KEYBOARD focus (`:focus-visible`), not on
 *   a mouse click's focus, which would leave it hanging after every press.
 *
 *   `label` is the tooltip AND the accessible name. The visible tooltip is `aria-hidden` so a
 *   screen reader says it once, from `aria-label`.
 *
 * Icons: Phosphor, as meeting-control-bar.tsx uses — `@phosphor-icons/react/dist/ssr`, size 17.
 */

import type { ReactNode, Ref } from "react";

import { cn } from "@/lib/utils";

export type DockIconButtonTone = "default" | "danger" | "accent" | "warning";

/**
 * Resting look per tone. `accent` is the one filled tone (Start translation); `warning` is a
 * wash for a state that is on and worth noticing (transcript paused). The warning ICON stays in
 * ink: the amber token is too light to carry an icon on a light surface on its own.
 */
const TONE_CLASS: Record<DockIconButtonTone, string> = {
  default: "border-border bg-surface-1 text-ink hover:bg-surface-3",
  danger: "border-border bg-surface-1 text-destructive hover:bg-destructive/10",
  accent: "border-primary bg-primary text-primary-foreground hover:bg-primary-hover",
  warning: "border-status-waiting/50 bg-status-waiting/15 text-ink hover:bg-status-waiting/25",
};

/**
 * `active` — "this is on / its panel is open". Applied over the tone, except on `accent`,
 * which is already filled.
 */
const ACTIVE_CLASS = "border-primary bg-primary/10 text-primary hover:bg-primary/15";

export function DockIconButton({
  label,
  icon,
  onClick,
  active = false,
  tone = "default",
  disabled = false,
  pressed,
  expanded,
  hasPopup,
  controls,
  tooltipAlign = "start",
  tooltipPlacement = "top",
  className,
  ref,
}: {
  /** Tooltip text and `aria-label`. Say what pressing it does: "Stop translation". */
  label: string;
  /** A Phosphor icon element, e.g. `<Stop size={17} weight="fill" />`. */
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  tone?: DockIconButtonTone;
  disabled?: boolean;
  /** For a toggle (Pause transcript): maps to `aria-pressed`. Omit for a plain action. */
  pressed?: boolean;
  /** For a button that opens a flyout: maps to `aria-expanded`. */
  expanded?: boolean;
  /** What it opens, for `aria-haspopup`. */
  hasPopup?: "menu" | "dialog";
  /** id of the flyout it opens, for `aria-controls` (only while open). */
  controls?: string;
  /**
   * Which edge the tooltip lines up with. `start` for buttons at the left of the dock, `end` for
   * the right end — a tooltip centred on the last button would run out of the 460px window.
   */
  tooltipAlign?: "start" | "center" | "end";
  /** Above for the dock (the default), below for the header. */
  tooltipPlacement?: "top" | "bottom";
  className?: string;
  /** For anchoring a flyout to the button. */
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <span className="group/dock-icon relative inline-flex shrink-0">
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={pressed}
        aria-expanded={expanded}
        aria-haspopup={hasPopup}
        aria-controls={expanded ? controls : undefined}
        className={cn(
          "grid size-[34px] place-items-center rounded-[9px] border transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
          "disabled:cursor-not-allowed disabled:opacity-40",
          TONE_CLASS[tone],
          active && tone !== "accent" && ACTIVE_CLASS,
          className,
        )}
      >
        {icon}
      </button>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-[5px] bg-ink px-2 py-1 text-[11px] font-medium leading-tight text-canvas opacity-0 shadow-sm transition-opacity duration-100",
          "group-hover/dock-icon:opacity-100 group-has-[:focus-visible]/dock-icon:opacity-100",
          tooltipPlacement === "top" ? "bottom-[calc(100%+7px)]" : "top-[calc(100%+7px)]",
          tooltipAlign === "start" && "left-0",
          tooltipAlign === "end" && "right-0",
          tooltipAlign === "center" && "left-1/2 -translate-x-1/2",
        )}
      >
        {label}
      </span>
    </span>
  );
}
