"use client";

import { Copy, X } from "@phosphor-icons/react/dist/ssr";

/**
 * "Your meeting's ready" — the link, inside the meeting.
 *
 * An instant meeting is created, started and entered by one click, so the host never passes the
 * screen that used to hand them the join link. That screen was not worth keeping (its other two
 * offers, "Configure" and "Join", are the meeting they are already in), but the link was: a
 * meeting nobody else can reach is not a meeting.
 *
 * So it appears here instead, the way Google Meet's own instant meeting greets you. Dismissible,
 * and shown once — the same link stays permanently available in the control bar's copy action
 * and in the Invite dialog, which is why this can afford to be a greeting rather than a fixture.
 */
export function MeetingReadyCard({
  joinLink,
  roomCode,
  onCopy,
  onInvite,
  onDismiss,
}: {
  joinLink: string;
  roomCode: string;
  onCopy: () => void;
  onInvite: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      data-meeting-ready-card
      className="absolute bottom-4 left-4 z-30 w-[320px] max-w-[calc(100%-2rem)] rounded-2xl border border-border/60 bg-canvas/95 p-4 shadow-xl backdrop-blur"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute right-2.5 top-2.5 rounded-md p-1 text-ink-muted transition hover:bg-surface-2 hover:text-ink"
      >
        <X weight="bold" className="size-3.5" />
      </button>

      <p className="text-[14px] font-semibold text-ink">Your meeting&rsquo;s ready</p>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
        Share this link with the people you want in the meeting.
      </p>

      <button
        type="button"
        onClick={onCopy}
        title={joinLink || roomCode}
        className="mt-3 flex w-full items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-left transition hover:bg-surface-2/70"
      >
        {/* The LINK is the thing being shared, so it is the thing shown — truncated, because a
            full origin does not fit and the code beneath it is what people read aloud anyway. */}
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">
          {joinLink || roomCode}
        </span>
        <Copy weight="bold" className="size-4 shrink-0 text-ink-muted" />
      </button>

      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-[12px] tracking-wide text-ink-muted">
          {roomCode}
        </span>
        <button
          type="button"
          onClick={onInvite}
          className="rounded-md px-2 py-1 text-[12px] font-medium text-primary transition hover:bg-primary/10"
        >
          Add others
        </button>
      </div>
    </div>
  );
}
