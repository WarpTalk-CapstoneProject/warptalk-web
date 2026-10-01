"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
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
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { UserChip } from "@/components/user/user-chip";
import { KIND_LABELS, describeAbsence, relativeTime } from "@/lib/meeting/artifact-library";
import type { ArtifactKind, LibraryEntry, MeetingRecordGroup } from "@/lib/meeting/artifact-library";
import { formatLanguageRoute } from "@/lib/language/languages";
import { recordsPath, roomDetailPath } from "@/lib/workspace/workspace-routes";
import { cn } from "@/lib/utils";

const KIND_ICONS: Record<ArtifactKind, React.ElementType> = {
  transcript: FileText,
  summary: Sparkle,
  minutes: Stamp,
};

export function ArtifactRecordHeader({
  group,
  entry,
  onSelectKind,
  workspaceSlug,
  onDrawUpMinutes,
  drawingUpMinutes = false,
  showKindSwitcher = true,
}: {
  group: MeetingRecordGroup;
  entry: LibraryEntry;
  onSelectKind: (kind: ArtifactKind) => void;
  workspaceSlug: string;
  onDrawUpMinutes?: () => void;
  drawingUpMinutes?: boolean;
  /** False when the reader already chose a kind (arrived with `?kind=`); the tab bar is redundant. */
  showKindSwitcher?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyBody() {
    if (!entry.body) return;
    try {
      await navigator.clipboard.writeText(entry.body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy this record.");
    }
  }

  return (
    <header className="flex flex-col gap-3 border-b border-border bg-surface-1 px-5 py-3.5">
      {/* Back Link */}
      <div className="flex items-center justify-between">
        <Link
          href={recordsPath(workspaceSlug)}
          className="flex w-fit items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Records</span>
        </Link>
        <span className="text-[11px] text-ink-subtle">
          {entry.statusLabel} · changed {relativeTime(entry.changedAt)}
        </span>
      </div>

      {/* Main Row: Title & Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-[18px] font-semibold tracking-tight text-ink">
            {group.roomTitle}
          </h1>
        </div>

        {/* Action Buttons */}
        <div className="flex shrink-0 items-center gap-1.5">
          {entry.body ? (
            <button
              type="button"
              onClick={copyBody}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
            >
              <Copy size={13} />
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          ) : null}

          {onDrawUpMinutes ? (
            <button
              type="button"
              onClick={onDrawUpMinutes}
              disabled={drawingUpMinutes}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-60"
            >
              {drawingUpMinutes ? (
                <SpinnerGap size={13} className="animate-spin" />
              ) : (
                <Stamp size={13} />
              )}
              <span>Draw up the minutes</span>
            </button>
          ) : null}

          <Link
            href={roomDetailPath(workspaceSlug, entry.roomId)}
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <ArrowSquareOut size={13} />
            <span>Open meeting</span>
          </Link>
        </div>
      </div>

      {/* Room Info Horizontal Meta Bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-muted">
        <span className="font-mono text-ink-subtle">{group.roomCode}</span>

        {group.hostName ? (
          <>
            <span aria-hidden className="text-ink-subtle">·</span>
            <div className="flex items-center gap-1.5">
              <UserChip
                user={{
                  userId: group.hostId,
                  name: group.hostName,
                  role: "Host",
                }}
                variant="text"
                size="sm"
                showAvatar
                className="text-[11px] text-ink-muted"
              />
            </div>
          </>
        ) : null}

        <span aria-hidden className="text-ink-subtle">·</span>
        <span className="flex items-center gap-1">
          <CalendarBlank size={12} className="text-ink-subtle" />
          <span>{formatDateTime(entry.meetingEndedAt)}</span>
        </span>

        <span aria-hidden className="text-ink-subtle">·</span>
        <span className="flex items-center gap-1">
          <Clock size={12} className="text-ink-subtle" />
          <span>{formatDuration(entry.durationSeconds)}</span>
        </span>

        {entry.participantCount ? (
          <>
            <span aria-hidden className="text-ink-subtle">·</span>
            <span className="flex items-center gap-1">
              <Users size={12} className="text-ink-subtle" />
              <span>{entry.participantCount} {entry.participantCount === 1 ? "participant" : "participants"}</span>
            </span>
          </>
        ) : null}

        {entry.sourceLanguage ? (
          <>
            <span aria-hidden className="text-ink-subtle">·</span>
            <span className="flex items-center gap-1">
              <Translate size={12} className="text-ink-subtle" />
              <span>{formatLanguageRoute(entry.sourceLanguage, entry.targetLanguages)}</span>
            </span>
          </>
        ) : null}

        {entry.kind === "minutes" && (entry.secretaryName || entry.chairName) ? (
          <>
            <span aria-hidden className="text-ink-subtle">·</span>
            <span className="flex items-center gap-1 text-ink-subtle">
              <Signature size={12} />
              {entry.secretaryName ? `Signed: ${entry.secretaryName}` : null}
              {entry.chairName ? ` · Approved: ${entry.chairName}` : null}
            </span>
          </>
        ) : null}
      </div>

      {/* Record Kind Switcher Tabs Bar */}
      {showKindSwitcher ? (
        <div
          role="tablist"
          aria-label="Records from this meeting"
          className="mt-1 flex items-center gap-1.5 pt-1"
        >
          {group.entries.map((candidate) => {
            const active = candidate.id === entry.id;
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
                  "flex min-w-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "border-ink bg-ink text-surface-1 shadow-sm"
                    : "border-border bg-surface-2 text-ink-muted hover:border-ink-subtle hover:text-ink",
                )}
              >
                <Icon size={12} weight={active ? "bold" : "regular"} className="shrink-0" />
                <span className="truncate">{KIND_LABELS[candidate.kind]}</span>
                {readable ? null : <LockSimple size={10} className="shrink-0 text-ink-subtle" />}
              </button>
            );
          })}
        </div>
      ) : null}
    </header>
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
