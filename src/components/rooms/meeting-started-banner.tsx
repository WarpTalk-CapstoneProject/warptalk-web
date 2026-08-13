"use client";

/**
 * "A meeting has started" — inside the content area, with a Join button.
 *
 * WHERE IT SITS, AND WHY
 *   Bottom-LEFT of the main column. Not the viewport corner it used to occupy: bottom-right holds
 *   the WarpBot launcher, and the mini meeting dock defaults near there too — the same corner the
 *   dock was moved out of for exactly this reason. Left of the content area is empty in every
 *   layout this app has, and it is still inside the region the notice is about.
 *
 *   It is positioned against a wrapper AROUND `<main>` rather than inside it, because `<main>` is
 *   the scroll container: an absolutely-positioned child of a scrolling box scrolls away with the
 *   content, and a Join button that disappears when you scroll is not a Join button.
 *
 * THE JOIN BUTTON IS THE POINT
 *   It shipped without one — not by omission, but because the href never arrived: the realtime
 *   payload spells its fields in snake_case and the client read camelCase, so `action_url` and
 *   `payload_json` were both undefined. See meeting-started-notice.ts, which now reads both.
 *   Rendering the notice without a way to act on it is the failure mode worth guarding, so when
 *   there is genuinely no target the text says so instead of showing a dead control.
 */

import { useEffect } from "react";
import Link from "next/link";
import { VideoCamera, X } from "@phosphor-icons/react/dist/ssr";

import { useMeetingStartedStore } from "@/stores/meeting-started-store";

/**
 * Long enough to notice and act on; short enough not to sit there after the meeting ended.
 * A four-second toast is one you miss while typing, and missing it means missing the meeting.
 */
const VISIBLE_MS = 20_000;

export function MeetingStartedBanner() {
  const notice = useMeetingStartedStore((state) => state.notice);
  const dismiss = useMeetingStartedStore((state) => state.dismiss);

  const key = notice?.key;
  useEffect(() => {
    if (!key) return;
    const timer = window.setTimeout(dismiss, VISIBLE_MS);
    // Keyed on the notice, so a second meeting starting restarts the clock rather than inheriting
    // whatever was left of the first one's.
    return () => window.clearTimeout(timer);
  }, [key, dismiss]);

  if (!notice) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-start p-4">
      <div className="pointer-events-auto flex w-full max-w-[360px] items-start gap-3 rounded-[14px] border border-border bg-surface-1 p-3.5 shadow-lg">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
          <VideoCamera size={17} weight="fill" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug text-ink">A meeting has started</p>
          <p className="mt-0.5 truncate text-[12px] text-ink-muted" title={notice.title}>
            {notice.title}
          </p>

          {notice.joinHref ? (
            <Link
              href={notice.joinHref}
              onClick={dismiss}
              className="mt-2.5 inline-flex h-[28px] items-center rounded-full bg-foreground px-3.5 text-[12px] font-medium text-background transition hover:opacity-90"
            >
              Join now
            </Link>
          ) : (
            <p className="mt-2 text-[11px] text-ink-subtle">Open it from your notifications.</p>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 grid size-6 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X size={11} weight="bold" />
        </button>
      </div>
    </div>
  );
}
