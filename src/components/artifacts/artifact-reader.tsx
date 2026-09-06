"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowSquareOut,
  CalendarBlank,
  Clock,
  Copy,
  LockSimple,
  Signature,
  SpinnerGap,
  Translate,
  Users,
  WarningCircle,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { KIND_LABELS, describeAbsence, relativeTime } from "@/lib/meeting/artifact-library";
import type { LibraryEntry } from "@/lib/meeting/artifact-library";
import { formatLanguageRoute } from "@/lib/language/languages";
import { roomDetailPath } from "@/lib/workspace/workspace-routes";

/**
 * One record, read in place.
 *
 * WHY READING HAPPENS HERE AND NOT ON THE MEETING
 *   Sending the reader to the meeting page to read what the card already holds would undo the
 *   page: the body arrived with the list, so a round trip to display it is a round trip for
 *   nothing, and it would put the reader back inside one meeting — which is the thing the
 *   library exists to get them out of. The link to the meeting stays, for when the question
 *   really is about the meeting.
 *
 * WHY THE FACTS SIT ABOVE THE TEXT
 *   This is the audit half. Who hosted it, when it ended, who signed it, how much a person
 *   changed before signing — those are the questions somebody opens a record to settle, and
 *   burying them under a transcript means scrolling past the answer to look for it.
 */
export function ArtifactReader({
  entry,
  workspaceSlug,
  onClose,
}: {
  entry: LibraryEntry;
  workspaceSlug: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyBody() {
    if (!entry.body) return;
    try {
      await navigator.clipboard.writeText(entry.body);
      setCopied(true);
      // Long enough to read the change, short enough that the button is not stuck saying
      // "Copied" the next time somebody looks at it.
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy this record.");
    }
  }

  return (
    <aside className="flex min-h-0 flex-col border-t border-border bg-surface-1 lg:border-l lg:border-t-0">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-subtle">
            {KIND_LABELS[entry.kind]}
          </p>
          <h2 className="mt-1 truncate text-[17px] font-semibold leading-6 text-ink" title={entry.title}>
            {entry.title}
          </h2>
          <p className="mt-0.5 truncate text-[11px] text-ink-muted" title={entry.roomTitle}>
            {entry.roomTitle} · {entry.roomCode}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close record"
          className="shrink-0 rounded p-1 text-ink-subtle transition-colors hover:text-ink"
        >
          <X size={15} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <dl className="grid grid-cols-2 gap-x-4 border-b border-border pb-4">
          <Fact icon={CalendarBlank} label="Meeting ended" value={formatDateTime(entry.meetingEndedAt)} />
          <Fact icon={Clock} label="Duration" value={formatDuration(entry.durationSeconds)} />
          <Fact icon={Users} label="People" value={entry.participantCount ? String(entry.participantCount) : "—"} />
          <Fact
            icon={Translate}
            label="Language route"
            value={
              entry.sourceLanguage
                ? formatLanguageRoute(entry.sourceLanguage, entry.targetLanguages)
                : "—"
            }
          />
        </dl>

        {/* Only minutes carry a signature block, and only when somebody has actually signed —
            an empty "Signed by —" is a row that implies a person and names none. */}
        {entry.kind === "minutes" && (entry.secretaryName || entry.chairName) ? (
          <dl className="grid grid-cols-2 gap-x-4 border-b border-border py-4">
            {entry.secretaryName ? (
              <Fact icon={Signature} label="Signed by" value={entry.secretaryName} />
            ) : null}
            {entry.chairName ? (
              <Fact icon={Signature} label="Approved by" value={entry.chairName} />
            ) : null}
            {typeof entry.editCountVsDraft === "number" ? (
              // The reader's only evidence that a person read the draft rather than approving it
              // unseen. Zero is the interesting value, so it is stated rather than hidden.
              <Fact
                icon={Signature}
                label="Edits before signing"
                value={String(entry.editCountVsDraft)}
              />
            ) : null}
          </dl>
        ) : null}

        <div className="flex items-center justify-between gap-3 py-3">
          <span className="text-[10px] text-ink-subtle">
            {entry.statusLabel} · changed {relativeTime(entry.changedAt)}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {entry.body ? (
              <button
                type="button"
                onClick={copyBody}
                className="flex items-center gap-1.5 rounded border border-border px-2 py-1 text-[10px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <Copy size={12} />
                {copied ? "Copied" : "Copy"}
              </button>
            ) : null}
            <Link
              href={roomDetailPath(workspaceSlug, entry.roomId)}
              className="flex items-center gap-1.5 rounded border border-border px-2 py-1 text-[10px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <ArrowSquareOut size={12} />
              Open meeting
            </Link>
          </div>
        </div>

        {entry.body ? (
          <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-canvas px-4 py-3.5 font-sans text-[11.5px] leading-[1.65] text-ink">
            {entry.body}
          </pre>
        ) : (
          <Unreadable entry={entry} />
        )}
      </div>
    </aside>
  );
}

/**
 * A record with no body, explained.
 *
 * Its own block rather than an error box: a withheld document is a decision somebody made and can
 * unmake, and rendering it in the shape of a failure sends the reader looking for a bug.
 */
function Unreadable({ entry }: { entry: LibraryEntry }) {
  if (!entry.absence) return null;

  const Icon =
    entry.absence === "withheld"
      ? LockSimple
      : entry.absence === "generating"
        ? SpinnerGap
        : WarningCircle;

  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border bg-canvas px-4 py-4">
      <Icon
        size={15}
        className={cn("mt-px shrink-0 text-ink-subtle", entry.absence === "generating" && "animate-spin")}
      />
      <p className="text-[11.5px] leading-5 text-ink-muted">
        {describeAbsence(entry.absence, entry.kind)}
      </p>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 py-2">
      <dt className="flex items-center gap-1.5 text-[10px] text-ink-subtle">
        <Icon size={12} />
        {label}
      </dt>
      <dd className="mt-1 truncate text-[11.5px] font-medium text-ink" title={value}>
        {value}
      </dd>
    </div>
  );
}

function formatDuration(seconds: number) {
  if (!seconds) return "—";
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}
