import { Check, Prohibit } from "@phosphor-icons/react/dist/ssr";

import {
  meetingDisplayState,
  meetingStateLabel,
  type MeetingDisplayState,
} from "@/lib/meeting/meeting-display-state";
import { cn } from "@/lib/utils";
import type { MeetingTimeState } from "@/types/myMeetings";

export { meetingStateLabel };

/**
 * A meeting's state as one small glyph — the Agenda row's only colour, and the Month chip's.
 *
 * The agenda design dropped the tinted pills and bordered cards: a month of them is a wall of
 * colour in which nothing stands out. So the WT-538 palette (rose is happening, sky is coming,
 * emerald is you were there, amber is missed, slate is called off) moved into this mark, and each
 * state got a SHAPE as well as a hue — dot, ring, check, dashed ring, slashed ring. Colour alone
 * fails for anyone who cannot tell sky from emerald at 13px; the shape carries it for them.
 *
 * Amber is a DASHED ring on purpose: a missed meeting must not read as a dimmer upcoming one
 * (same ring, warmer colour) — confusing the two is the bug WT-538 exists to remove. And nothing
 * here is struck through: `line-through` was removed from the schedule in 8953691 and stays gone.
 *
 * Decorative by default, because the rows that use it already speak the state in their accessible
 * name. Pass `labelled` where the icon is the only place the state is said.
 */
export function MeetingStateIcon({
  meeting,
  size = 13,
  labelled = false,
  className,
}: {
  meeting: { status: string; timeState: MeetingTimeState };
  size?: number;
  labelled?: boolean;
  className?: string;
}) {
  const state = meetingDisplayState(meeting);
  const a11y = labelled
    ? { role: "img" as const, "aria-label": meetingStateLabel(meeting) }
    : { "aria-hidden": true as const };

  return (
    <span
      {...a11y}
      title={labelled ? meetingStateLabel(meeting) : undefined}
      className={cn("inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <Glyph state={state} size={size} />
    </span>
  );
}

function Glyph({ state, size }: { state: MeetingDisplayState; size: number }) {
  // Cancelled first, mirroring `meetingDisplayState`: a called-off meeting gets no pulse and no
  // ring of the state its slot would otherwise have had.
  if (state === "cancelled") {
    return <Prohibit size={size} weight="bold" className="text-slate-400 dark:text-slate-500" />;
  }

  if (state === "live") {
    // The same two-layer dot the page's Week card uses. `motion-safe:` because a
    // ping that never stops is exactly what prefers-reduced-motion asks us not to draw; the solid
    // dot underneath still says "live" without it.
    const dot = Math.round(size * 0.55);
    return (
      <span className="relative flex" style={{ width: dot, height: dot }}>
        <span className="absolute inline-flex size-full rounded-full bg-rose-500/70 motion-safe:animate-ping" />
        <span className="relative inline-flex size-full rounded-full bg-rose-500" />
      </span>
    );
  }

  if (state === "joined") {
    return (
      <Check size={size} weight="bold" className="text-emerald-600 dark:text-emerald-400" />
    );
  }

  // Upcoming and missed are the same ring drawn two ways, as SVG so the dash pattern is even at
  // 13px — a CSS `border-dashed` on a circle this small renders as two or three uneven blobs.
  const missed = state === "missed";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={
        missed ? "text-amber-500 dark:text-amber-400" : "text-sky-500 dark:text-sky-400"
      }
    >
      <circle
        cx="8"
        cy="8"
        r="5.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={missed ? "2.9 2.86" : undefined}
      />
    </svg>
  );
}
