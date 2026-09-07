"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowSquareOut,
  CalendarBlank,
  Clock,
  Copy,
  FileText,
  LockSimple,
  Signature,
  Sparkle,
  SpinnerGap,
  Stamp,
  Translate,
  Users,
  WarningCircle,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { KIND_LABELS, describeAbsence, relativeTime } from "@/lib/meeting/artifact-library";
import type { ArtifactKind, LibraryEntry, MeetingRecordGroup } from "@/lib/meeting/artifact-library";
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
 *
 * ONE MEETING, THREE DOCUMENTS
 *   The panel opens on a MEETING and switches between what it produced. The facts above the text
 *   belong to the meeting, so they do not move when the reader changes document — which is what
 *   makes the three read as one meeting's contents rather than as three unrelated files that
 *   happen to share a title.
 */
export function ArtifactReader({
  group,
  entry,
  onSelectKind,
  workspaceSlug,
  onClose,
  onDrawUpMinutes,
  drawingUpMinutes = false,
}: {
  group: MeetingRecordGroup;
  /** The one currently open. Always a member of `group.entries`. */
  entry: LibraryEntry;
  onSelectKind: (kind: ArtifactKind) => void;
  workspaceSlug: string;
  onClose: () => void;
  /**
   * Draw this meeting's biên bản up from the summary being read.
   *
   * Omitted unless it would actually work — the page owns that decision because only it can see
   * every entry at once (it has to know whether this room already HAS minutes). Reaching minutes
   * otherwise means opening the meeting, finding the Minutes tab and pressing a button four
   * steps in, which is a large part of why production holds so few of them.
   */
  onDrawUpMinutes?: () => void;
  drawingUpMinutes?: boolean;
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
          <h2 className="truncate text-[17px] font-semibold leading-6 text-ink" title={group.roomTitle}>
            {group.roomTitle}
          </h2>
          <p className="mt-0.5 truncate text-[11px] text-ink-muted">
            {group.roomCode}
            {group.hostName ? ` · ${group.hostName}` : ""}
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

      <RecordTabs group={group} current={entry} onSelectKind={onSelectKind} />

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
            {onDrawUpMinutes ? (
              <button
                type="button"
                onClick={onDrawUpMinutes}
                disabled={drawingUpMinutes}
                className="flex items-center gap-1.5 rounded border border-border px-2 py-1 text-[10px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-60"
              >
                {drawingUpMinutes ? (
                  <SpinnerGap size={12} className="animate-spin" />
                ) : (
                  <Stamp size={12} />
                )}
                Draw up the minutes
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

const KIND_ICONS: Record<ArtifactKind, React.ElementType> = {
  transcript: FileText,
  summary: Sparkle,
  minutes: Stamp,
};

/**
 * The meeting's three documents, as a row you switch between.
 *
 * Every record the meeting produced is listed, INCLUDING the ones this viewer cannot open. A tab
 * that is present but locked answers "is there a transcript?" — which is the question — while
 * hiding it answers a different question the reader did not ask, and answers it misleadingly.
 *
 * Rendered even when there is only one, so the panel says what it is holding. A single unlabelled
 * document is the state the old panel was permanently in.
 */
function RecordTabs({
  group,
  current,
  onSelectKind,
}: {
  group: MeetingRecordGroup;
  current: LibraryEntry;
  onSelectKind: (kind: ArtifactKind) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Records from this meeting"
      className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-1.5"
    >
      {group.entries.map((candidate) => {
        const active = candidate.id === current.id;
        const Icon = KIND_ICONS[candidate.kind];
        const readable = Boolean(candidate.body);
        return (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelectKind(candidate.kind)}
            title={readable ? undefined : describeAbsence(candidate.absence ?? "unavailable", candidate.kind)}
            className={cn(
              "flex min-w-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
              active ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            <Icon size={12} weight="fill" className="shrink-0" />
            <span className="truncate">{KIND_LABELS[candidate.kind]}</span>
            {readable ? null : <LockSimple size={10} className="shrink-0 text-ink-subtle" />}
          </button>
        );
      })}
    </div>
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
