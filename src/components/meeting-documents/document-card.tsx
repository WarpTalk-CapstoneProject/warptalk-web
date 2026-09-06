"use client";

/**
 * One document, as a card.
 *
 * The card's NAME is the meeting's title, not the document's. A document here has no name of its
 * own — `translation_room_artifacts` has no title column, and the server-generated ones read
 * "transcript export (TXT)", which repeats on the second line what the badge already said. What
 * makes a card findable is which meeting it came from, so that is the line set in the reading
 * size and everything else is metadata under it.
 */

import {
  CheckCircle,
  FileText,
  LockSimple,
  Notepad,
  SpinnerGap,
  Stamp,
  VideoCamera,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

import {
  meetingDocumentFormat,
  meetingDocumentLabel,
  minutesUnavailableCopy,
} from "@/types/meetingDocument";
import type { MeetingDocumentDto, MeetingDocumentType } from "@/types/meetingDocument";

const TYPE_ICONS: Record<MeetingDocumentType, typeof FileText> = {
  TRANSCRIPT_EXPORT: FileText,
  SUMMARY_EXPORT: Notepad,
  RECORDING: VideoCamera,
  MINUTES: Stamp,
};

/**
 * Minutes carry a lifecycle nothing else here has — a draft is not an approved record, and a
 * reader scanning a grid needs to see which without opening it. Artifact statuses are all
 * "COMPLETED" in practice and say nothing, so they are shown only when they are NOT that.
 */
function statusLabel(document: MeetingDocumentDto): string | null {
  if (document.type === "MINUTES") {
    if (document.status === "APPROVED") return "Approved";
    if (document.status === "IN_REVIEW") return "In review";
    return "Draft";
  }
  if (document.consentRequired) return "Consent required";
  const status = document.status?.toUpperCase();
  if (!status || status === "COMPLETED" || status === "READY" || status === "ACTIVE") return null;
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function DocumentCard({
  document,
  onOpen,
  onDrawUpMinutes,
  drawingUpMinutes,
}: {
  document: MeetingDocumentDto;
  onOpen: () => void;
  /** Omitted when this card is not a place to start minutes from. */
  onDrawUpMinutes?: () => void;
  drawingUpMinutes?: boolean;
}) {
  const Icon = TYPE_ICONS[document.type];
  const status = statusLabel(document);
  const blocked = minutesUnavailableCopy(document.minutesUnavailableReason);
  const showsNothingToRecord =
    document.type === "SUMMARY_EXPORT" &&
    document.minutesUnavailableReason === "NOTHING_TO_RECORD";

  return (
    <div className="group flex min-w-0 flex-col rounded-lg border border-border bg-surface-1 transition-colors hover:border-border/80 hover:bg-surface-2/40">
      {/* The whole upper card is the open affordance. The minutes action below is a SEPARATE
          button and deliberately outside it — nesting a button inside a button is invalid, and
          more to the point "read this" and "create a new document" must not share a hit target. */}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col gap-3 p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-canvas text-ink-muted">
            <Icon size={17} />
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Shown up front, not discovered on click. Rooms default to HOST_ONLY, so a
                participant browsing a workspace's documents meets this constantly. */}
            {!document.canOpen ? (
              <span
                title="Only the meeting's host can open this"
                className="flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-[10px] text-ink-muted"
              >
                <LockSimple size={10} />
                Private
              </span>
            ) : null}
            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-ink-muted">
              {meetingDocumentLabel(document.type)}
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium leading-5 text-ink" title={document.meetingTitle}>
            {document.meetingTitle}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-ink-subtle">
            {document.translationRoomCode}
            {document.minutesNo ? ` · ${document.minutesNo}` : ""}
          </p>
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1 text-[10px] text-ink-subtle">
          <span className="tabular-nums">{formatDate(document.meetingEndedAt ?? document.createdAt)}</span>
          <Dot />
          <span>{meetingDocumentFormat(document)}</span>
          {status ? (
            <>
              <Dot />
              <span className="flex items-center gap-1">
                <StatusIcon document={document} />
                {status}
              </span>
            </>
          ) : null}
        </div>
      </button>

      {onDrawUpMinutes ? (
        <div className="border-t border-border px-4 py-2.5">
          <button
            type="button"
            onClick={onDrawUpMinutes}
            disabled={drawingUpMinutes}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-[11px] font-medium text-canvas transition-opacity disabled:opacity-60"
          >
            {drawingUpMinutes ? <SpinnerGap size={12} className="animate-spin" /> : <Stamp size={12} />}
            Draw up the minutes
          </button>
        </div>
      ) : showsNothingToRecord ? (
        // ONLY "nothing to record", of the four reasons. That one is about the MEETING — it
        // answers "why does this meeting have no minutes?" and stops somebody hunting for a
        // feature that is not broken. The other three are about the viewer or the clock
        // ("you are not the chair", "it has not ended", "they already exist"), which is noise
        // printed under every card for anyone who is not the host.
        <p className="border-t border-border px-4 py-2.5 text-[10px] leading-4 text-ink-subtle">
          {blocked}
        </p>
      ) : null}
    </div>
  );
}

function StatusIcon({ document }: { document: MeetingDocumentDto }) {
  const status = document.status?.toUpperCase();
  if (status === "PROCESSING") return <SpinnerGap size={10} className="animate-spin" />;
  if (status === "APPROVED") return <CheckCircle size={10} className="text-primary" />;
  if (["FAILED", "MISSING", "EXPIRED", "DELETED"].includes(status ?? "")) {
    return <WarningCircle size={10} />;
  }
  return null;
}

function Dot(): ReactNode {
  return <span aria-hidden className="size-0.5 rounded-full bg-ink-subtle/60" />;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}
