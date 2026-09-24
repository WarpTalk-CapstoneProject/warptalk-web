"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowSquareOut, CalendarBlank, Check, Copy, VideoCamera } from "@phosphor-icons/react";

import { GoogleMeetMark } from "@/components/meeting/google-meet-mark";
import {
  extractMeetingLinks,
  formatMeetingWhen,
  type MeetingLinkRef,
} from "@/lib/assistant/meeting-links";
import { cn } from "@/lib/utils";

/**
 * The meetings a WarpBot answer created, as cards under the answer.
 *
 * 17 Sep: "tạo 1 cuộc họp bằng @Google Meet" left the user with no link to click and no code to
 * share, and nothing on screen said whether "the meeting" was on Google Meet or in WarpTalk. The
 * cards are read from the markers the worker appends (see lib/assistant/meeting-links), so they
 * appear on every surface WarpBot speaks on and come back when a conversation is reopened.
 *
 * The kinds look different on purpose: a Google Meet meeting carries Google's mark and a "Join
 * Google Meet" button that leaves WarpTalk; a WarpTalk room carries WarpTalk's label and opens in
 * WarpTalk; the bridge room that translates a Google Meet meeting says so.
 */
export function MeetingLinkCards({
  markdown,
  openRoomsOutside = false,
}: {
  markdown: string;
  /**
   * Open a WarpTalk room in a new tab instead of in place: in the bridge popup, navigating would
   * replace the widget; in a live meeting, it would take the user out of the call.
   */
  openRoomsOutside?: boolean;
}) {
  const links = extractMeetingLinks(markdown);
  if (links.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {links.map((link) =>
        link.kind === "google_meet" ? (
          <GoogleMeetCard key={`meet:${link.id}`} link={link} />
        ) : (
          <WarpTalkRoomCard key={`room:${link.id}`} link={link} openOutside={openRoomsOutside} />
        ),
      )}
    </div>
  );
}

const CARD = "flex flex-col gap-2 rounded-xl border border-border bg-surface-1 p-3 text-ink";
const BUTTON =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-surface-2";

function NewTabHint() {
  return <span className="sr-only"> (opens in a new tab)</span>;
}

function CardTop({ badge, meta }: { badge: ReactNode; meta?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {badge}
      {meta ? <span className="text-[11.5px] text-ink-muted">{meta}</span> : null}
    </div>
  );
}

function CodeBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
      <span className="text-[10px] uppercase tracking-wide text-ink-subtle">{label}</span>
      <span className="font-mono text-[13px] font-medium tracking-wide">{value}</span>
      <CopyButton
        value={value}
        label="Copy"
        ariaLabel={`Copy ${label.toLowerCase()}`}
        className="ml-auto px-2 py-0.5 text-[11px]"
      />
    </div>
  );
}

function GoogleMeetCard({ link }: { link: MeetingLinkRef }) {
  return (
    <div role="group" aria-label={`Google Meet meeting ${link.title ?? link.id}`} className={CARD}>
      <CardTop
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-400">
            <GoogleMeetMark size={11} />
            Google Meet
          </span>
        }
        meta={formatMeetingWhen(link.start, link.end)}
      />
      {link.title ? <p className="text-[13px] font-semibold leading-snug">{link.title}</p> : null}
      {link.code ? <CodeBox label="Code" value={link.code} /> : null}
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-[12px] text-primary underline underline-offset-2"
      >
        {link.url}
        <NewTabHint />
      </a>
      <div className="flex flex-wrap gap-1.5">
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-emerald-700"
        >
          <ArrowSquareOut size={13} aria-hidden />
          Join Google Meet
          <NewTabHint />
        </a>
        <CopyButton value={link.url} label="Copy link" className={BUTTON} withIcon />
        {link.calendarUrl ? (
          <a href={link.calendarUrl} target="_blank" rel="noopener noreferrer" className={BUTTON}>
            <CalendarBlank size={13} aria-hidden />
            Open in Calendar
            <NewTabHint />
          </a>
        ) : null}
      </div>
    </div>
  );
}

function WarpTalkRoomCard({ link, openOutside }: { link: MeetingLinkRef; openOutside: boolean }) {
  const bridge = link.roomType === "EXTERNAL_BRIDGE";
  const openClass =
    "inline-flex items-center gap-1.5 rounded-lg bg-ink px-2.5 py-1.5 text-[12px] font-medium text-surface-1 transition-opacity hover:opacity-90";

  return (
    <div
      role="group"
      aria-label={`${bridge ? "WarpTalk translation" : "WarpTalk room"} ${link.title ?? ""}`.trim()}
      className={CARD}
    >
      <CardTop
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary">
            <VideoCamera size={11} weight="fill" aria-hidden />
            {bridge ? "WarpTalk translation" : "WarpTalk room"}
          </span>
        }
        meta={bridge ? "Translates the Google Meet meeting" : formatMeetingWhen(link.start, link.end)}
      />
      {link.title ? <p className="text-[13px] font-semibold leading-snug">{link.title}</p> : null}
      {link.code && !bridge ? <CodeBox label="Room code" value={link.code} /> : null}
      <div className="flex flex-wrap gap-1.5">
        {openOutside ? (
          <a href={link.url} target="_blank" rel="noopener noreferrer" className={openClass}>
            Open room
            <NewTabHint />
          </a>
        ) : (
          <Link href={link.url} className={openClass}>
            Open room
          </Link>
        )}
        <CopyButton
          // Resolved on click, not on render: the origin is the browser's, and reading it while
          // rendering would differ between the server and the client.
          value={() => `${window.location.origin}${link.url}`}
          label="Copy link"
          className={BUTTON}
          withIcon
        />
      </div>
    </div>
  );
}

function CopyButton({
  value,
  label,
  ariaLabel,
  className,
  withIcon = false,
}: {
  value: string | (() => string);
  label: string;
  ariaLabel?: string;
  className?: string;
  withIcon?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(typeof value === "function" ? value() : value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (permissions, insecure origin): the link and code are on screen to
      // select by hand, so there is nothing better to do than stay quiet.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={ariaLabel ?? label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 font-medium text-ink transition-colors hover:bg-surface-2",
        className,
      )}
    >
      {withIcon ? (copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />) : null}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
