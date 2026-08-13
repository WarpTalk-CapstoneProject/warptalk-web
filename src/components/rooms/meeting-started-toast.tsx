"use client";

/**
 * "X started a meeting" — bottom right, with a Join button.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE INVITE TOAST
 *   An invitation and a meeting starting are different news at different times. An invite can
 *   wait; a meeting that is running right now cannot, and the only useful response to it is one
 *   click. The invite toast next to this one already proved the shape works — this is the same
 *   idea for the moment that actually matters.
 *
 *   Until recently this notification never arrived at all: MEETING_STARTED was missing from the
 *   notification service's schema table, so every one was discarded at validation
 *   (warptalk-backend#190). The popup had nothing to render.
 *
 * IT DOES NOT AUTO-DISMISS QUICKLY
 *   A toast that vanishes in four seconds is a toast you miss while typing, and missing it means
 *   missing the meeting. Twenty seconds, dismissible, and it never stacks more than one deep —
 *   two meetings starting at once is a real thing in a busy workspace and two overlapping
 *   modals in the corner is not an answer to it.
 */

import Link from "next/link";
import { VideoCamera, X } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { playNotificationCue } from "@/lib/notifications/notification-sounds";

/** Long enough to notice and act on; short enough not to sit there after the meeting ended. */
const VISIBLE_MS = 20_000;

/** One at a time. See the note above about stacking. */
const TOAST_ID = "meeting-started";

export function showMeetingStartedToast(input: {
  title: string;
  /** Who started it, when the notification says. */
  host?: string | null;
  /** Where Join goes. Omitted when the payload carried no room — the toast still informs. */
  joinHref?: string | null;
}) {
  playNotificationCue("meeting-started");

  toast.custom(
    (id) => (
      <div className="flex w-full max-w-sm items-start gap-3 rounded-[14px] border border-border bg-surface-1 p-3.5 shadow-lg">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
          <VideoCamera size={17} weight="fill" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug text-ink">
            {input.host ? `${input.host} started a meeting` : "A meeting has started"}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-ink-muted">{input.title}</p>

          {input.joinHref ? (
            <Link
              href={input.joinHref}
              onClick={() => toast.dismiss(id)}
              className="mt-2.5 inline-flex h-[28px] items-center rounded-full bg-foreground px-3 text-[12px] font-medium text-background transition hover:opacity-90"
            >
              Join now
            </Link>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => toast.dismiss(id)}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 grid size-6 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X size={11} weight="bold" />
        </button>
      </div>
    ),
    {
      id: TOAST_ID,
      duration: VISIBLE_MS,
      // Bottom right, per-toast rather than by moving the app's Toaster: everything else that
      // uses toasts — save confirmations, errors — is placed where people already expect it,
      // and relocating all of them to fit one notification is the wrong trade.
      position: "bottom-right",
    },
  );
}
