"use client";

/**
 * The banner across the top of the dashboard — and the only place on this page colour belongs.
 *
 * WHY IT IS ITS OWN BLOCK
 *   The gradient used to live inside the "No plan on this workspace" card, which tied the one
 *   decorative surface on the page to an error state: a workspace WITH a plan got a flat page
 *   with no top to it, and a workspace without one got its warning dressed up as a promotion.
 *   Those are two different jobs. This is the masthead; the plan notice below is a fact.
 *
 * THE GRADIENT IS BLURRED BLOBS, NOT AN IMAGE
 *   Three radial blobs under `blur-3xl`, bleeding off the right edge inside `overflow-hidden`.
 *   They stay soft at any width, cost no asset to download, respond to the theme's own primary
 *   colour, and cannot band the way a stretched linear-gradient PNG does on a wide monitor.
 *
 * IT DISMISSES, AND REMEMBERS
 *   A banner that cannot be closed is an advert. The choice is per-device in localStorage rather
 *   than per-account: whether you want the top of your dashboard back is a property of the screen
 *   you are sitting at, and it must survive a reload without a round trip.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "@phosphor-icons/react/dist/ssr";

const DISMISS_KEY = "warptalk.dashboard.hero-dismissed";

export function DashboardHero({
  title,
  description,
  actionLabel,
  actionHref,
  /** Bumped when the message changes, so a new banner is not hidden by an old dismissal. */
  messageKey,
}: {
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  messageKey: string;
}) {
  // Read after mount, never during render: localStorage does not exist while the server renders
  // this, and reading it in the body would hydrate a banner the browser has already been told to
  // hide — the classic flash of a dismissed element.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === messageKey);
    } catch {
      // Private mode, or storage blocked. Showing the banner is the better default.
    }
  }, [messageKey]);

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, messageKey);
    } catch {
      // The preference simply does not survive this reload.
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-hairline bg-surface-1">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -right-24 -top-32 size-[26rem] rounded-full bg-[var(--primary)]/22 blur-3xl" />
        <div className="absolute -bottom-40 right-24 size-[22rem] rounded-full bg-emerald-400/18 blur-3xl" />
        <div className="absolute -top-24 right-[22rem] size-[20rem] rounded-full bg-fuchsia-400/16 blur-3xl" />
        <div className="absolute -bottom-28 right-[38rem] size-[18rem] rounded-full bg-amber-300/12 blur-3xl" />
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 z-10 grid size-6 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <X size={11} weight="bold" />
      </button>

      {/* max-w on the copy, not on the container: the blobs need the full width to bleed across,
          and text that runs under them is what makes a gradient look like a mistake. */}
      <div className="relative max-w-[38rem] px-6 py-7">
        <h2 className="text-[22px] font-semibold leading-tight text-ink">{title}</h2>
        <p className="mt-2 text-[13px] leading-6 text-ink-muted">{description}</p>
        <Link
          href={actionHref}
          className="mt-5 inline-flex h-[34px] items-center gap-1.5 rounded-lg bg-foreground px-4 text-[13px] font-medium text-background transition hover:opacity-90"
        >
          {actionLabel}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
